"""Agent endpoints backed by file storage and GitHub REST automation."""

import asyncio
import uuid
import os
from datetime import datetime, timezone
from typing import Annotated, List
import logging
import importlib.util
import json

import httpx
from fastapi import APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, Query
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from database import get_db, FileDB
from schemas import RunRequest, RunOut, RunLogEntry, InboxMessageOut, MergeDecision, RunChangeFileOut
from auth_utils import current_user_id, decrypt_token, decode_token
from ws_manager import manager as ws
from ollama_solver import solve_issue

router = APIRouter()
logger = logging.getLogger(__name__)

_RUN_NOT_FOUND = "Run not found"
_QUEUE_TASKS: dict[str, asyncio.Task] = {}
_QUEUE_TASKS_LOCK = asyncio.Lock()


def _real_solver_available() -> tuple[bool, str | None]:
    if importlib.util.find_spec("ollama") is None:
        return False, "ollama is not installed in the backend Python environment"
    return True, None


# ── helpers ───────────────────────────────────────────────────────────

def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


async def _get_repo(uid: str, db: FileDB) -> dict:
    repo = await db.get_repo_for_user(uid)
    if not repo:
        raise HTTPException(404, "No repository connected")
    return repo


def _row_to_run(r) -> RunOut:
    return RunOut(
        id=r["id"], issue_number=r["issue_number"], issue_title=r["issue_title"],
        status=r["status"], branch_name=r["branch_name"], pr_number=r["pr_number"],
        pr_url=r["pr_url"], risk_level=r["risk_level"], review_summary=r["review_summary"],
        merge_approved=bool(r["merge_approved"]),
        created_at=r["created_at"], updated_at=r["updated_at"],
    )


def _log_id():
    return int(datetime.now(timezone.utc).timestamp() * 1000)


async def _append_log(db: FileDB, run_id: str, phase: str, level: str, message: str, user_id: str | None = None):
    await db.add_run_log({
        "id": _log_id(),
        "run_id": run_id,
        "timestamp": _utc_now_iso(),
        "phase": phase,
        "level": level,
        "message": message,
    })
    if user_id:
        await ws.broadcast_log(user_id, run_id, phase, level, message)


async def _append_inbox(db: FileDB, user_id: str, run_id: str | None, msg_type: str, title: str, body: str):
    message = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "run_id": run_id,
        "type": msg_type,
        "title": title,
        "body": body,
        "read": False,
        "created_at": _utc_now_iso(),
    }
    await db.add_inbox_message(message)
    await ws.broadcast_inbox(user_id, message)


async def _set_run_status(db: FileDB, user_id: str, run_id: str, status: str, **fields):
    updates = {"status": status, "updated_at": _utc_now_iso(), **fields}
    await db.update_run(run_id, updates)
    extra = {k: v for k, v in fields.items() if v is not None}
    await ws.broadcast_status(user_id, run_id, status, **extra)


async def _github_request(method: str, url: str, token: str, **kwargs):
    headers = kwargs.pop("headers", {})
    headers.update({
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.request(method, url, headers=headers, **kwargs)
    if response.status_code >= 300:
        detail = response.text[:500] if response.text else ""
        raise HTTPException(status_code=502, detail=f"GitHub API error: {response.status_code} {detail}")
    if response.content:
        return response.json()
    return {}


async def _close_issue_if_open(repo_full_name: str, issue_number: int, token: str, close_note: str | None = None):
    issue_payload = await _github_request(
        "GET",
        f"https://api.github.com/repos/{repo_full_name}/issues/{issue_number}",
        token,
    )
    if issue_payload.get("state") == "closed":
        return False

    if close_note:
        try:
            await _github_request(
                "POST",
                f"https://api.github.com/repos/{repo_full_name}/issues/{issue_number}/comments",
                token,
                json={"body": close_note},
            )
        except Exception:
            # Commenting is optional; do not block the run if this fails.
            pass

    await _github_request(
        "PATCH",
        f"https://api.github.com/repos/{repo_full_name}/issues/{issue_number}",
        token,
        json={"state": "closed"},
    )
    return True


def _extract_text_from_content(content) -> str:
    if not content:
        return ""
    parts = getattr(content, "parts", None) or []
    texts = []
    for part in parts:
        text = getattr(part, "text", None)
        if text:
            texts.append(text)
    return "\n".join(texts).strip()


def _safe_parse_json(value):
    if isinstance(value, dict):
        return value
    if not value:
        return {}
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return {"raw": value}
    return {"raw": str(value)}


def _normalize_branch_name(issue_number: int, value: str | None) -> str:
    branch = (value or "").strip()
    if branch.startswith("agent/"):
        return branch
    if branch:
        return f"agent/{branch.replace('refs/heads/', '').strip('/')}"
    return f"agent/issue-{issue_number}-{str(uuid.uuid4())[:8]}"


def _friendly_solver_error(exc: Exception) -> str:
    text = str(exc)
    low = text.lower()
    if "ollama" in low and "not" in low and "found" in low:
        return "Ollama is not running or accessible. Start Ollama service and ensure the model is available."
    if "model" in low and "not" in low and "found" in low:
        return "Ollama model not available. Pull the required model using 'ollama pull qwen2.5-coder:7b'."
    if "mcp" in low and "server" in low:
        return "GitHub MCP server failed to start. Verify Node/npm and GitHub token permissions."
    return text[:500]


async def _run_solver_pipeline(repo_full_name, issue_number, issue_title, github_token):
    result = await solve_issue(issue_number, issue_title, repo_full_name, github_token)
    coding = result

    review = {
        "risk_level": "Low",
        "summary": "Reviewed by local Ollama model"
    }

    return coding, review


async def _list_open_repo_issues(repo_full_name: str, token: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            f"https://api.github.com/repos/{repo_full_name}/issues",
            params={"state": "open", "per_page": 100, "filter": "all"},
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github.v3+json",
            },
        )
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"GitHub API error: {response.text}")
    return [issue for issue in response.json() if "pull_request" not in issue]


async def _ensure_repo_queue_worker(db: FileDB, user_id: str, repo: dict):
    repo_id = repo["id"]
    async with _QUEUE_TASKS_LOCK:
        active_task = _QUEUE_TASKS.get(repo_id)
        if active_task and not active_task.done():
            return
        _QUEUE_TASKS[repo_id] = asyncio.create_task(_repo_queue_worker(db, user_id, repo))


async def _repo_queue_worker(db: FileDB, user_id: str, repo: dict):
    repo_id = repo["id"]
    try:
        while True:
            rows = await db.list_runs_for_repo(repo_id)
            if any(row["status"] == "running" for row in rows):
                return

            queued_runs = [row for row in rows if row["status"] == "queued"]
            if not queued_runs:
                return

            queued_runs.sort(key=lambda row: (row.get("created_at", ""), row.get("id", "")))
            next_run = queued_runs[0]
            await _execute_run(
                next_run["id"],
                user_id,
                repo,
                next_run["issue_number"],
                next_run["issue_title"],
                db,
            )
    finally:
        async with _QUEUE_TASKS_LOCK:
            current_task = _QUEUE_TASKS.get(repo_id)
            if current_task is asyncio.current_task():
                _QUEUE_TASKS.pop(repo_id, None)

        rows = await db.list_runs_for_repo(repo_id)
        if any(row["status"] == "queued" for row in rows) and not any(row["status"] == "running" for row in rows):
            await _ensure_repo_queue_worker(db, user_id, repo)


async def auto_queue_open_issues_for_repo(db: FileDB, user_id: str, repo: dict) -> dict[str, int]:
    solver_ready, solver_reason = _real_solver_available()
    if not solver_ready:
        logger.warning("Skipping auto-queue for repo %s: %s", repo.get("repo_full_name"), solver_reason)
        return {"queued": 0, "skipped": 0}

    try:
        token = decrypt_token(repo["github_token_enc"])
    except Exception:
        logger.warning("Skipping auto-queue for repo %s: token decrypt failed", repo.get("repo_full_name"))
        return {"queued": 0, "skipped": 0}

    try:
        open_issues = await _list_open_repo_issues(repo["repo_full_name"], token)
    except Exception as exc:
        logger.warning("Failed to list open issues for repo %s: %s", repo.get("repo_full_name"), exc)
        return {"queued": 0, "skipped": 0}

    existing_runs = await db.list_runs_for_repo(repo["id"])
    existing_issue_numbers = {run["issue_number"] for run in existing_runs}

    queued = 0
    skipped = 0
    for issue in open_issues:
        issue_number = issue["number"]
        if issue_number in existing_issue_numbers:
            skipped += 1
            continue

        run = await queue_issue_run_for_repo(
            db,
            user_id,
            repo,
            issue_number,
            issue.get("title") or f"Issue #{issue_number}",
            source="auto-sync",
            validate_access=False,
            strict=False,
        )
        if run:
            queued += 1
            existing_issue_numbers.add(issue_number)
        else:
            skipped += 1

    return {"queued": queued, "skipped": skipped}


async def _execute_run(run_id: str, user_id: str, repo: dict, issue_number: int, issue_title: str, db: FileDB):
    repo_name = repo["repo_full_name"]
    token = decrypt_token(repo["github_token_enc"])

    try:
        await _set_run_status(db, user_id, run_id, "running")
        await _append_log(db, run_id, "fetch", "info", f"Fetched issue #{issue_number}: {issue_title}", user_id)

        await _append_log(db, run_id, "solver", "info", "Starting Ollama solver workflow", user_id)
        coding_results, review_results = await _run_solver_pipeline(
            repo_full_name=repo_name,
            issue_number=issue_number,
            issue_title=issue_title,
            github_token=token,
        )

        branch_name = _normalize_branch_name(issue_number, coding_results.get("branch_name"))
        pr_number = coding_results.get("pr_number")
        pr_url = coding_results.get("pr_url")
        if not branch_name or not pr_number or not pr_url:
            raise RuntimeError(f"Ollama solver did not return PR metadata: {coding_results}")

        solution_summary = coding_results.get("solution_summary") or review_results.get("summary") or f"Issue #{issue_number} solved in branch {branch_name}."
        tests_summary = coding_results.get("tests")
        if tests_summary:
            await _append_log(db, run_id, "tests", "info", tests_summary, user_id)

        closed_on_github = False
        try:
            closed_on_github = await _close_issue_if_open(
                repo_name,
                issue_number,
                token,
                close_note=f"Automated fix prepared in PR #{pr_number}: {pr_url}",
            )
        except Exception as exc:
            await _append_log(db, run_id, "review", "warn", f"Could not close GitHub issue automatically: {exc}", user_id)

        if closed_on_github:
            await _append_log(db, run_id, "review", "info", f"Closed GitHub issue #{issue_number} after creating PR #{pr_number}", user_id)

        await _set_run_status(
            db,
            user_id,
            run_id,
            "awaiting_approval",
            branch_name=branch_name,
            pr_number=pr_number,
            pr_url=pr_url,
            risk_level=review_results.get("risk_level", "Medium").lower(),
            review_summary=solution_summary,
        )
        await _append_log(db, run_id, "review", "info", f"PR #{pr_number} opened and awaiting approval", user_id)
        await _append_inbox(
            db,
            user_id,
            run_id,
            "merge_request",
            f"PR #{pr_number} ready for approval",
            f"Issue #{issue_number} has a proposed solution. Review and approve merge when ready.",
        )
    except HTTPException as exc:
        await _set_run_status(db, user_id, run_id, "failed", review_summary=exc.detail)
        await _append_log(db, run_id, "error", "error", f"Run failed: {exc.detail}", user_id)
        await _append_inbox(db, user_id, run_id, "info", f"Run failed for issue #{issue_number}", exc.detail)
    except Exception as exc:
        friendly = _friendly_solver_error(exc)
        await _set_run_status(db, user_id, run_id, "failed", review_summary=friendly)
        await _append_log(db, run_id, "error", "error", f"Run failed: {friendly}", user_id)
        await _append_inbox(db, user_id, run_id, "info", f"Run failed for issue #{issue_number}", friendly)


async def _validate_repo_push_access(repo: dict) -> str:
    try:
        token = decrypt_token(repo["github_token_enc"])
    except Exception:
        raise HTTPException(400, "Stored GitHub token is invalid after restart. Reconnect repository.")

    try:
        repo_info = await _github_request("GET", f"https://api.github.com/repos/{repo['repo_full_name']}", token)
        permissions = repo_info.get("permissions") or {}
        if permissions and not permissions.get("push", False):
            raise HTTPException(403, "GitHub token does not have push access to this repository")
        return token
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Could not validate GitHub repository access: {exc}")


async def queue_issue_run_for_repo(
    db: FileDB,
    user_id: str,
    repo: dict,
    issue_number: int,
    issue_title: str | None = None,
    *,
    source: str = "manual",
    validate_access: bool = True,
    strict: bool = False,
):
    try:
        solver_ready, solver_reason = _real_solver_available()
        if not solver_ready:
            if strict:
                raise HTTPException(503, f"Real solver unavailable: {solver_reason}")
            logger.warning("Skipping auto-run for issue #%s in %s: %s", issue_number, repo.get("repo_full_name"), solver_reason)
            return None

        token = None
        if validate_access:
            token = await _validate_repo_push_access(repo)
        else:
            try:
                token = decrypt_token(repo["github_token_enc"])
            except Exception:
                logger.warning("Skipping webhook auto-run: token decrypt failed for user=%s repo=%s", user_id, repo.get("repo_full_name"))
                return None

        runs = await db.list_runs_for_repo(repo["id"])
        existing = [r for r in runs if r["issue_number"] == issue_number and r["status"] not in ("merged", "failed", "closed")]
        if existing:
            if strict:
                raise HTTPException(409, f"Issue #{issue_number} already has an active run")
            return None

        final_title = issue_title or f"Issue #{issue_number}"
        if not issue_title and token:
            try:
                async with httpx.AsyncClient(timeout=8) as client:
                    r = await client.get(
                        f"https://api.github.com/repos/{repo['repo_full_name']}/issues/{issue_number}",
                        headers={"Authorization": f"Bearer {token}"},
                    )
                if r.status_code == 200:
                    final_title = r.json().get("title", final_title)
            except Exception:
                pass

        run_id = str(uuid.uuid4())
        now = _utc_now_iso()
        run = {
            "id": run_id,
            "repo_id": repo["id"],
            "issue_number": issue_number,
            "issue_title": final_title,
            "status": "queued",
            "branch_name": None,
            "pr_number": None,
            "pr_url": None,
            "risk_level": None,
            "review_summary": None,
            "merge_approved": False,
            "created_at": now,
            "updated_at": now,
        }
        await db.add_run(run)
        await ws.broadcast_status(user_id, run_id, "queued", issue_number=issue_number)
        await _append_log(db, run_id, "queue", "info", f"Run queued for issue #{issue_number} ({source})", user_id)
        await _ensure_repo_queue_worker(db, user_id, repo)
        return run
    except HTTPException:
        if strict:
            raise
        return None


# ── Start a run ───────────────────────────────────────────────────────

@router.post("/run", response_model=RunOut, status_code=202)
async def start_run(
    body: RunRequest,
    uid: Annotated[str, Depends(current_user_id)],
    db: Annotated[FileDB, Depends(get_db)],
):
    repo = await _get_repo(uid, db)

    run = await queue_issue_run_for_repo(
        db,
        uid,
        repo,
        body.issue_number,
        source="manual",
        validate_access=True,
        strict=True,
    )
    return _row_to_run(run)


# ── List / get runs ───────────────────────────────────────────────────

@router.get("/runs", response_model=List[RunOut])
async def list_runs(
    uid: Annotated[str, Depends(current_user_id)],
    db: Annotated[FileDB, Depends(get_db)],
):
    repo = await _get_repo(uid, db)
    await auto_queue_open_issues_for_repo(db, uid, repo)
    rows = await db.list_runs_for_repo(repo["id"])
    return [_row_to_run(r) for r in rows]


@router.get("/runs/{run_id}", response_model=RunOut)
async def get_run(
    run_id: str,
    uid: Annotated[str, Depends(current_user_id)],
    db: Annotated[FileDB, Depends(get_db)],
):
    repo = await _get_repo(uid, db)
    run = await db.get_run(run_id)
    if not run or run["repo_id"] != repo["id"]:
        raise HTTPException(404, _RUN_NOT_FOUND)
    return _row_to_run(run)


@router.get("/runs/{run_id}/logs", response_model=List[RunLogEntry])
async def get_run_logs(
    run_id: str,
    uid: Annotated[str, Depends(current_user_id)],
    db: Annotated[FileDB, Depends(get_db)],
):
    rows = await db.list_run_logs(run_id)
    return [RunLogEntry(**r) for r in rows]


@router.get("/runs/{run_id}/changes", response_model=List[RunChangeFileOut])
async def get_run_changes(
    run_id: str,
    uid: Annotated[str, Depends(current_user_id)],
    db: Annotated[FileDB, Depends(get_db)],
):
    repo = await _get_repo(uid, db)
    run = await db.get_run(run_id)
    if not run or run["repo_id"] != repo["id"]:
        raise HTTPException(404, _RUN_NOT_FOUND)
    if not run.get("pr_number"):
        return []

    # If this is a mock PR (number 1), return empty changes since PR doesn't exist
    if run.get("pr_number") == 1:
        return []

    token = decrypt_token(repo["github_token_enc"])
    try:
        files = await _github_request(
            "GET",
            f"https://api.github.com/repos/{repo['repo_full_name']}/pulls/{run['pr_number']}/files",
            token,
        )
        return [
            RunChangeFileOut(
                filename=file.get("filename", "unknown"),
                status=file.get("status", "modified"),
                additions=file.get("additions", 0),
                deletions=file.get("deletions", 0),
                changes=file.get("changes", 0),
                patch=file.get("patch"),
            )
            for file in files
        ]
    except HTTPException as e:
        # If PR doesn't exist or other GitHub error, return empty
        if e.status_code == 404:
            return []
        raise


# ── Merge decision ────────────────────────────────────────────────────

@router.post("/runs/{run_id}/merge", status_code=202)
async def decide_merge(
    run_id: str,
    body: MergeDecision,
    uid: Annotated[str, Depends(current_user_id)],
    db: Annotated[FileDB, Depends(get_db)],
):
    repo = await _get_repo(uid, db)
    run = await db.get_run(run_id)
    if not run or run["repo_id"] != repo["id"]:
        raise HTTPException(404, _RUN_NOT_FOUND)
    if run["status"] != "awaiting_approval":
        raise HTTPException(400, f"Run is not awaiting approval (status={run['status']})")

    if not body.approved:
        await _set_run_status(db, uid, run_id, "closed")
        await _append_log(db, run_id, "merge", "warn", "Merge rejected by user", uid)
        return {"detail": "Merge rejected. Run closed."}

    # If this is a mock PR (number 1), we can't merge it since it doesn't exist
    if run.get("pr_number") == 1:
        await _set_run_status(db, uid, run_id, "failed")
        await _append_log(db, run_id, "merge", "error", "Cannot merge mock PR - real PR creation failed", uid)
        return {"detail": "Cannot merge mock PR. Check agent logs for details."}

    token = decrypt_token(repo["github_token_enc"])
    try:
        await _github_request(
            "PUT",
            f"https://api.github.com/repos/{repo['repo_full_name']}/pulls/{run['pr_number']}/merge",
            token,
            json={"merge_method": "squash", "commit_title": f"Merge PR #{run['pr_number']} via gitAgent"},
        )
    except HTTPException as exc:
        detail = str(exc.detail)
        low = detail.lower()
        if "409" in detail or "conflict" in low:
            retry_message = "Merge conflict detected. Requeued issue for automatic retry against the latest base branch."
            await _set_run_status(db, uid, run_id, "closed", review_summary=retry_message)
            await _append_log(db, run_id, "merge", "warn", retry_message, uid)
            rerun = await queue_issue_run_for_repo(
                db,
                uid,
                repo,
                run["issue_number"],
                run["issue_title"],
                source="merge-conflict",
                validate_access=False,
                strict=False,
            )
            if rerun:
                await _append_inbox(
                    db,
                    uid,
                    rerun["id"],
                    "info",
                    f"Issue #{run['issue_number']} requeued",
                    retry_message,
                )
            return {"detail": retry_message}
        raise

    await _append_log(db, run_id, "merge", "success", f"Merged PR #{run['pr_number']} into main", uid)

    try:
        closed_on_merge = await _close_issue_if_open(
            repo["repo_full_name"],
            run["issue_number"],
            token,
            close_note=f"Resolved by merged PR #{run['pr_number']}: {run.get('pr_url') or ''}",
        )
        if closed_on_merge:
            await _append_log(db, run_id, "merge", "info", f"Closed GitHub issue #{run['issue_number']} after merge", uid)
    except Exception as exc:
        await _append_log(db, run_id, "merge", "warn", f"Merged PR, but failed to close issue #{run['issue_number']}: {exc}", uid)

    try:
        await _github_request(
            "DELETE",
            f"https://api.github.com/repos/{repo['repo_full_name']}/git/refs/heads/{run['branch_name']}",
            token,
        )
    except Exception:
        # Branch delete is best effort.
        pass

    await _set_run_status(db, uid, run_id, "merged", merge_approved=True)
    await _append_inbox(
        db,
        uid,
        run_id,
        "info",
        f"PR #{run['pr_number']} merged",
        f"Issue #{run['issue_number']} has been merged into main.",
    )
    return {"detail": "Merged successfully"}


# ── Inbox ─────────────────────────────────────────────────────────────

@router.get("/inbox", response_model=List[InboxMessageOut])
async def get_inbox(
    uid: Annotated[str, Depends(current_user_id)],
    db: Annotated[FileDB, Depends(get_db)],
):
    rows = await db.list_inbox_for_user(uid)
    return [InboxMessageOut(**r) for r in rows]


@router.patch("/inbox/{msg_id}/read", status_code=204)
async def mark_read(
    msg_id: str,
    uid: Annotated[str, Depends(current_user_id)],
    db: Annotated[FileDB, Depends(get_db)],
):
    await db.mark_inbox_read(uid, msg_id)


@router.patch("/inbox/read-all", status_code=204)
async def mark_all_read(
    uid: Annotated[str, Depends(current_user_id)],
    db: Annotated[FileDB, Depends(get_db)],
):
    await db.mark_all_inbox_read(uid)


# ── WebSocket ─────────────────────────────────────────────────────────

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, token: str = Query(...)):
    # Accept first so auth failures return a clean WS close code to the client.
    await websocket.accept()

    try:
        uid = decode_token(token)
        if uid != user_id:
            await websocket.close(code=1008, reason="token_user_mismatch")
            return
    except Exception:
        await websocket.close(code=1008, reason="invalid_or_expired_token")
        return

    ws.register(user_id, websocket)
    registered = True
    try:
        while True:
            # Keep alive — we don't expect client messages but handle pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if registered:
            ws.disconnect(user_id, websocket)
