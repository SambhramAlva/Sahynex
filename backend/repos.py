"""
Repo endpoints:
  POST   /api/repos/connect
  GET    /api/repos/current
  DELETE /api/repos/disconnect
"""

import uuid
import re
from datetime import datetime, timezone
import httpx
from fastapi import APIRouter, HTTPException, Depends

from database import get_db, FileDB
from schemas import RepoConnectRequest, RepoOut
from auth_utils import current_user_id, decrypt_token, encrypt_token

router = APIRouter()


def _parse_repo_name(url: str) -> str:
    """Extract 'owner/repo' from a GitHub URL."""
    m = re.search(r"github\.com[/:]([^/]+/[^/]+?)(?:\.git)?$", url.strip())
    if not m:
        raise HTTPException(status_code=400, detail="Invalid GitHub repo URL")
    return m.group(1).rstrip("/")


async def _verify_github_token(token: str, repo_full_name: str):
    """Quick API call to verify token has repo access."""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"https://api.github.com/repos/{repo_full_name}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github.v3+json"},
        )
    if r.status_code == 401:
        raise HTTPException(status_code=401, detail="GitHub token is invalid")
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="Repository not found or token lacks access")
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"GitHub API error: {r.status_code}")
    return r.json()


@router.post("/connect", response_model=RepoOut, status_code=201)
async def connect_repo(
    body: RepoConnectRequest,
    uid: str = Depends(current_user_id),
    db: FileDB = Depends(get_db),
):
    repo_full_name = _parse_repo_name(body.repo_url)

    user = await db.get_user_by_id(uid)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    github_token = (body.github_token or "").strip()
    github_token_enc = user.get("github_token_enc")

    if github_token:
        github_token_enc = encrypt_token(github_token)
    elif github_token_enc:
        try:
            github_token = decrypt_token(github_token_enc)
        except Exception:
            raise HTTPException(status_code=401, detail="Stored GitHub token is invalid. Please provide a new GitHub token.")
    else:
        raise HTTPException(status_code=400, detail="GitHub token is required")

    repo_data = await _verify_github_token(github_token, repo_full_name)
    owner_login = ((repo_data.get("owner") or {}).get("login") or "").strip() or None

    await db.update_user(
        uid,
        {
            "github_token_enc": github_token_enc,
            "github_login": owner_login,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    repo_id = str(uuid.uuid4())
    default_branch = repo_data.get("default_branch", "main")
    connected_at = datetime.now(timezone.utc).isoformat()

    stored_repo = {
        "id": repo_id,
        "user_id": uid,
        "repo_url": body.repo_url,
        "repo_full_name": repo_full_name,
        "github_token_enc": github_token_enc,
        "default_branch": default_branch,
        "connected_at": connected_at,
    }
    await db.upsert_repo_for_user(stored_repo)

    try:
        from agent import auto_queue_open_issues_for_repo

        await auto_queue_open_issues_for_repo(db, uid, stored_repo)
    except Exception:
        # Auto-queue is best effort; the UI sync path will retry if needed.
        pass

    return RepoOut(
        id=repo_id,
        repo_url=body.repo_url,
        repo_full_name=repo_full_name,
        default_branch=default_branch,
        connected_at=connected_at,
    )


@router.get("/current", response_model=RepoOut)
async def get_current_repo(
    uid: str = Depends(current_user_id),
    db: FileDB = Depends(get_db),
):
    repo = await db.get_repo_for_user(uid)
    if not repo:
        raise HTTPException(status_code=404, detail="No repository connected")
    return RepoOut(
        id=repo["id"], repo_url=repo["repo_url"], repo_full_name=repo["repo_full_name"],
        default_branch=repo["default_branch"], connected_at=repo["connected_at"],
    )


@router.delete("/disconnect", status_code=204)
async def disconnect_repo(
    uid: str = Depends(current_user_id),
    db: FileDB = Depends(get_db),
):
    await db.delete_repo_for_user(uid)
