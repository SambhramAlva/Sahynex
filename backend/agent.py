"""
Agent endpoints:
  POST   /api/agent/run               — start agent pipeline for an issue
  GET    /api/agent/runs              — list all runs for this user's repo
  GET    /api/agent/runs/{id}         — single run detail
  GET    /api/agent/runs/{id}/logs    — all logs for a run
  POST   /api/agent/runs/{id}/merge   — human approves/rejects merge
  GET    /api/agent/inbox             — inbox messages
  PATCH  /api/agent/inbox/{id}/read   — mark message read
  WS     /api/agent/ws/{user_id}      — real-time event stream
"""

import asyncio
import uuid
import aiosqlite
from typing import List

from fastapi import APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import JSONResponse

from database import get_db
from schemas import RunRequest, RunOut, RunLogEntry, InboxMessageOut, MergeDecision
from auth_utils import current_user_id, decrypt_token, decode_token
from ws_manager import manager as ws
from agent_pipeline import run_agent_pipeline, execute_merge

router = APIRouter()


# ── helpers ───────────────────────────────────────────────────────────

async def _get_repo(uid: str, db: aiosqlite.Connection) -> dict:
    rows = await db.execute_fetchall(
        "SELECT * FROM repos WHERE user_id = ? LIMIT 1", (uid,)
    )
    if not rows:
        raise HTTPException(404, "No repository connected")
    return dict(rows[0])


def _row_to_run(r) -> RunOut:
    return RunOut(
        id=r["id"], issue_number=r["issue_number"], issue_title=r["issue_title"],
        status=r["status"], branch_name=r["branch_name"], pr_number=r["pr_number"],
        pr_url=r["pr_url"], risk_level=r["risk_level"], review_summary=r["review_summary"],
        merge_approved=bool(r["merge_approved"]),
        created_at=r["created_at"], updated_at=r["updated_at"],
    )


# ── Start a run ───────────────────────────────────────────────────────

@router.post("/run", response_model=RunOut, status_code=202)
async def start_run(
    body: RunRequest,
    uid: str = Depends(current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    repo = await _get_repo(uid, db)

    # Prevent duplicate active runs for same issue
    existing = await db.execute_fetchall(
        "SELECT id FROM agent_runs WHERE repo_id=? AND issue_number=? AND status NOT IN ('merged','failed')",
        (repo["id"], body.issue_number),
    )
    if existing:
        raise HTTPException(409, f"Issue #{body.issue_number} already has an active run")

    # Fetch issue title from GitHub (best-effort)
    issue_title = f"Issue #{body.issue_number}"
    try:
        import httpx
        token = decrypt_token(repo["github_token_enc"])
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                f"https://api.github.com/repos/{repo['repo_full_name']}/issues/{body.issue_number}",
                headers={"Authorization": f"Bearer {token}"},
            )
        if r.status_code == 200:
            issue_title = r.json().get("title", issue_title)
    except Exception:
        pass

    run_id = str(uuid.uuid4())
    await db.execute(
        """INSERT INTO agent_runs (id, repo_id, issue_number, issue_title, status)
           VALUES (?,?,?,?,'queued')""",
        (run_id, repo["id"], body.issue_number, issue_title),
    )
    await db.commit()

    github_token = decrypt_token(repo["github_token_enc"])

    # Fire-and-forget background task
    asyncio.create_task(
        run_agent_pipeline(
            run_id=run_id, user_id=uid,
            repo_full_name=repo["repo_full_name"],
            github_token=github_token,
            issue_number=body.issue_number,
            issue_title=issue_title,
        )
    )

    rows = await db.execute_fetchall("SELECT * FROM agent_runs WHERE id=?", (run_id,))
    return _row_to_run(rows[0])


# ── List / get runs ───────────────────────────────────────────────────

@router.get("/runs", response_model=List[RunOut])
async def list_runs(
    uid: str = Depends(current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    repo = await _get_repo(uid, db)
    rows = await db.execute_fetchall(
        "SELECT * FROM agent_runs WHERE repo_id=? ORDER BY created_at DESC", (repo["id"],)
    )
    return [_row_to_run(r) for r in rows]


@router.get("/runs/{run_id}", response_model=RunOut)
async def get_run(
    run_id: str,
    uid: str = Depends(current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    repo = await _get_repo(uid, db)
    rows = await db.execute_fetchall(
        "SELECT * FROM agent_runs WHERE id=? AND repo_id=?", (run_id, repo["id"])
    )
    if not rows:
        raise HTTPException(404, "Run not found")
    return _row_to_run(rows[0])


@router.get("/runs/{run_id}/logs", response_model=List[RunLogEntry])
async def get_run_logs(
    run_id: str,
    uid: str = Depends(current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    rows = await db.execute_fetchall(
        "SELECT * FROM run_logs WHERE run_id=? ORDER BY id ASC", (run_id,)
    )
    return [RunLogEntry(**dict(r)) for r in rows]


# ── Merge decision ────────────────────────────────────────────────────

@router.post("/runs/{run_id}/merge", status_code=202)
async def decide_merge(
    run_id: str,
    body: MergeDecision,
    uid: str = Depends(current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    repo = await _get_repo(uid, db)
    rows = await db.execute_fetchall(
        "SELECT * FROM agent_runs WHERE id=? AND repo_id=?", (run_id, repo["id"])
    )
    if not rows:
        raise HTTPException(404, "Run not found")
    run = dict(rows[0])
    if run["status"] != "awaiting_approval":
        raise HTTPException(400, f"Run is not awaiting approval (status={run['status']})")

    if not body.approved:
        await db.execute("UPDATE agent_runs SET status='closed' WHERE id=?", (run_id,))
        await db.commit()
        return {"detail": "Merge rejected. Run closed."}

    github_token = decrypt_token(repo["github_token_enc"])
    asyncio.create_task(
        execute_merge(
            run_id=run_id, user_id=uid,
            repo_full_name=repo["repo_full_name"],
            github_token=github_token,
            pr_number=run["pr_number"],
            branch_name=run["branch_name"],
        )
    )
    return {"detail": "Merge started"}


# ── Inbox ─────────────────────────────────────────────────────────────

@router.get("/inbox", response_model=List[InboxMessageOut])
async def get_inbox(
    uid: str = Depends(current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    rows = await db.execute_fetchall(
        "SELECT * FROM inbox_messages WHERE user_id=? ORDER BY created_at DESC", (uid,)
    )
    return [InboxMessageOut(**dict(r)) for r in rows]


@router.patch("/inbox/{msg_id}/read", status_code=204)
async def mark_read(
    msg_id: str,
    uid: str = Depends(current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    await db.execute(
        "UPDATE inbox_messages SET read=TRUE WHERE id=? AND user_id=?", (msg_id, uid)
    )
    await db.commit()


@router.patch("/inbox/read-all", status_code=204)
async def mark_all_read(
    uid: str = Depends(current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    await db.execute("UPDATE inbox_messages SET read=TRUE WHERE user_id=?", (uid,))
    await db.commit()


# ── WebSocket ─────────────────────────────────────────────────────────

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, token: str = Query(...)):
    # Verify JWT before accepting
    try:
        uid = decode_token(token)
        if uid != user_id:
            await websocket.close(code=4001)
            return
    except Exception:
        await websocket.close(code=4001)
        return

    await ws.connect(user_id, websocket)
    try:
        while True:
            # Keep alive — we don't expect client messages but handle pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws.disconnect(user_id, websocket)
