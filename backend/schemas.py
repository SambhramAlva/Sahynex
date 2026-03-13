"""Pydantic schemas shared across routers and agent."""

from __future__ import annotations
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, EmailStr, HttpUrl


# ── Auth ──────────────────────────────────────────────────────────────
class SignUpRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class UserOut(BaseModel):
    id: str
    name: str
    email: str


# ── Repo ──────────────────────────────────────────────────────────────
class RepoConnectRequest(BaseModel):
    repo_url: str
    github_token: str

class RepoOut(BaseModel):
    id: str
    repo_url: str
    repo_full_name: str
    default_branch: str
    connected_at: datetime


# ── Issues ────────────────────────────────────────────────────────────
class IssueOut(BaseModel):
    number: int
    title: str
    state: str
    labels: List[str]
    body: Optional[str]
    html_url: str
    created_at: str


# ── Agent Runs ────────────────────────────────────────────────────────
class RunRequest(BaseModel):
    issue_number: int

class RunOut(BaseModel):
    id: str
    issue_number: int
    issue_title: Optional[str]
    status: str          # queued | running | review | merged | failed
    branch_name: Optional[str]
    pr_number: Optional[int]
    pr_url: Optional[str]
    risk_level: Optional[str]
    review_summary: Optional[str]
    merge_approved: bool
    created_at: datetime
    updated_at: datetime

class RunLogEntry(BaseModel):
    id: int
    run_id: str
    timestamp: datetime
    phase: Optional[str]
    level: str
    message: str


# ── Inbox ─────────────────────────────────────────────────────────────
class InboxMessageOut(BaseModel):
    id: str
    run_id: Optional[str]
    type: str
    title: str
    body: Optional[str]
    read: bool
    created_at: datetime

class MergeDecision(BaseModel):
    approved: bool


# ── WebSocket broadcast event ─────────────────────────────────────────
class WsEvent(BaseModel):
    event: str            # log | status_change | inbox_new | merge_request
    run_id: Optional[str] = None
    data: dict = {}
