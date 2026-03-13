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
from auth_utils import current_user_id, encrypt_token

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
    repo_data = await _verify_github_token(body.github_token, repo_full_name)

    repo_id = str(uuid.uuid4())
    default_branch = repo_data.get("default_branch", "main")
    connected_at = datetime.now(timezone.utc).isoformat()

    await db.upsert_repo_for_user({
        "id": repo_id,
        "user_id": uid,
        "repo_url": body.repo_url,
        "repo_full_name": repo_full_name,
        "github_token_enc": encrypt_token(body.github_token),
        "default_branch": default_branch,
        "connected_at": connected_at,
    })

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
