"""
Issues endpoints:
  GET /api/issues          — list open GitHub issues
  GET /api/issues/{number} — single issue detail
"""

import httpx
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List

from database import get_db, FileDB
from schemas import IssueOut
from auth_utils import current_user_id, decrypt_token

router = APIRouter()


async def _get_repo_and_token(uid: str, db: FileDB):
    repo = await db.get_repo_for_user(uid)
    if not repo:
        raise HTTPException(status_code=404, detail="No repository connected")
    return repo["repo_full_name"], decrypt_token(repo["github_token_enc"])


@router.get("", response_model=List[IssueOut])
async def list_issues(
    state: str = Query("open", pattern="^(open|closed|all)$"),
    uid: str = Depends(current_user_id),
    db: FileDB = Depends(get_db),
):
    repo, token = await _get_repo_and_token(uid, db)
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"https://api.github.com/repos/{repo}/issues",
            params={"state": state, "per_page": 50, "filter": "all"},
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github.v3+json"},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"GitHub API error: {r.text}")

    issues = []
    for i in r.json():
        if "pull_request" in i:   # skip PRs that appear in issues list
            continue
        issues.append(IssueOut(
            number=i["number"],
            title=i["title"],
            state=i["state"],
            labels=[l["name"] for l in i.get("labels", [])],
            body=i.get("body"),
            html_url=i["html_url"],
            created_at=i["created_at"],
        ))
    return issues


@router.get("/{number}", response_model=IssueOut)
async def get_issue(
    number: int,
    uid: str = Depends(current_user_id),
    db: FileDB = Depends(get_db),
):
    repo, token = await _get_repo_and_token(uid, db)
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"https://api.github.com/repos/{repo}/issues/{number}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github.v3+json"},
        )
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="Issue not found")
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"GitHub API error: {r.text}")

    i = r.json()
    return IssueOut(
        number=i["number"], title=i["title"], state=i["state"],
        labels=[l["name"] for l in i.get("labels", [])],
        body=i.get("body"), html_url=i["html_url"], created_at=i["created_at"],
    )
