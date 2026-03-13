"""
GitHub Webhook receiver — POST /api/webhooks/github

Optional: configure your repo webhook to point here so the agent
auto-detects new issues without polling.

Secret validation uses GITHUB_WEBHOOK_SECRET env var.
"""

import hashlib
import hmac
import logging
import os

from fastapi import APIRouter, Request, HTTPException, Header
from typing import Optional

router = APIRouter()
logger = logging.getLogger(__name__)

WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "")


def _verify_signature(payload: bytes, sig_header: str) -> bool:
    if not WEBHOOK_SECRET:
        return True  # skip validation in dev if secret not set
    expected = "sha256=" + hmac.new(
        WEBHOOK_SECRET.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, sig_header or "")


@router.post("/github")
async def github_webhook(
    request: Request,
    x_github_event: Optional[str] = Header(None),
    x_hub_signature_256: Optional[str] = Header(None),
):
    payload = await request.body()

    if not _verify_signature(payload, x_hub_signature_256 or ""):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    data = await request.json()
    event = x_github_event or "unknown"
    logger.info("GitHub webhook received: %s", event)

    if event == "issues" and data.get("action") == "opened":
        issue = data["issue"]
        repo  = data["repository"]["full_name"]
        logger.info("New issue opened: #%d in %s — '%s'",
                    issue["number"], repo, issue["title"])
        # Future: auto-trigger agent for labelled issues
        # e.g. if "gitAgent" label is present, call run_agent_pipeline

    elif event == "pull_request":
        action = data.get("action")
        pr = data.get("pull_request", {})
        logger.info("PR event: action=%s pr=#%s", action, pr.get("number"))

    return {"ok": True}
