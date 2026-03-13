"""Temporary file-based persistence for local development."""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterator

logger = logging.getLogger(__name__)

DB_FILE = Path(os.getenv("DATABASE_FILE", "gitAgent.json"))
_LOCK = asyncio.Lock()


def _empty_db():
    return {
        "users": [],
        "repos": [],
        "agent_runs": [],
        "run_logs": [],
        "inbox_messages": [],
    }


def _normalize_db(payload: dict):
    baseline = _empty_db()
    if not isinstance(payload, dict):
        return baseline
    for key, default_value in baseline.items():
        if key not in payload or not isinstance(payload[key], list):
            payload[key] = default_value
    return payload


class FileDB:
    def __init__(self, file_path: Path):
        self.file_path = file_path

    async def _read(self):
        if not self.file_path.exists():
            return _empty_db()
        try:
            with self.file_path.open("r", encoding="utf-8") as f:
                return _normalize_db(json.load(f))
        except Exception:
            return _empty_db()

    async def _write(self, payload):
        with self.file_path.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)

    async def get_user_by_email(self, email: str):
        async with _LOCK:
            db = await self._read()
            return next((u for u in db["users"] if u["email"] == email), None)

    async def get_user_by_id(self, user_id: str):
        async with _LOCK:
            db = await self._read()
            return next((u for u in db["users"] if u["id"] == user_id), None)

    async def add_user(self, user: dict):
        async with _LOCK:
            db = await self._read()
            db["users"].append(user)
            await self._write(db)

    async def upsert_repo_for_user(self, repo: dict):
        async with _LOCK:
            db = await self._read()
            db["repos"] = [r for r in db["repos"] if r["user_id"] != repo["user_id"]]
            db["repos"].append(repo)
            await self._write(db)

    async def get_repo_for_user(self, user_id: str):
        async with _LOCK:
            db = await self._read()
            repos = [r for r in db["repos"] if r["user_id"] == user_id]
            repos.sort(key=lambda x: x.get("connected_at", ""), reverse=True)
            return repos[0] if repos else None

    async def list_repos_by_full_name(self, repo_full_name: str):
        async with _LOCK:
            db = await self._read()
            return [r for r in db["repos"] if r.get("repo_full_name", "").lower() == repo_full_name.lower()]

    async def delete_repo_for_user(self, user_id: str):
        async with _LOCK:
            db = await self._read()
            db["repos"] = [r for r in db["repos"] if r["user_id"] != user_id]
            await self._write(db)

    async def add_run(self, run: dict):
        async with _LOCK:
            db = await self._read()
            db["agent_runs"].append(run)
            await self._write(db)

    async def list_runs_for_repo(self, repo_id: str):
        async with _LOCK:
            db = await self._read()
            runs = [r for r in db["agent_runs"] if r["repo_id"] == repo_id]
            runs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
            return runs

    async def get_run(self, run_id: str):
        async with _LOCK:
            db = await self._read()
            return next((r for r in db["agent_runs"] if r["id"] == run_id), None)

    async def update_run(self, run_id: str, updates: dict):
        async with _LOCK:
            db = await self._read()
            for idx, run in enumerate(db["agent_runs"]):
                if run["id"] == run_id:
                    db["agent_runs"][idx] = {**run, **updates}
                    await self._write(db)
                    return db["agent_runs"][idx]
            return None

    async def add_run_log(self, log: dict):
        async with _LOCK:
            db = await self._read()
            db["run_logs"].append(log)
            await self._write(db)

    async def list_run_logs(self, run_id: str):
        async with _LOCK:
            db = await self._read()
            logs = [l for l in db["run_logs"] if l["run_id"] == run_id]
            logs.sort(key=lambda x: x.get("timestamp", ""))
            return logs

    async def add_inbox_message(self, msg: dict):
        async with _LOCK:
            db = await self._read()
            db["inbox_messages"].append(msg)
            await self._write(db)

    async def list_inbox_for_user(self, user_id: str):
        async with _LOCK:
            db = await self._read()
            msgs = [m for m in db["inbox_messages"] if m["user_id"] == user_id]
            msgs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
            return msgs

    async def mark_inbox_read(self, user_id: str, msg_id: str):
        async with _LOCK:
            db = await self._read()
            for idx, msg in enumerate(db["inbox_messages"]):
                if msg["user_id"] == user_id and msg["id"] == msg_id:
                    db["inbox_messages"][idx] = {**msg, "read": True}
            await self._write(db)

    async def mark_all_inbox_read(self, user_id: str):
        async with _LOCK:
            db = await self._read()
            for idx, msg in enumerate(db["inbox_messages"]):
                if msg["user_id"] == user_id:
                    db["inbox_messages"][idx] = {**msg, "read": True}
            await self._write(db)


async def get_db() -> AsyncIterator[FileDB]:
    """Dependency: yields a file-backed DB helper."""
    yield FileDB(DB_FILE)


async def init_db():
    """Initialize JSON storage file."""
    if not DB_FILE.exists():
        DB_FILE.parent.mkdir(parents=True, exist_ok=True)
        with DB_FILE.open("w", encoding="utf-8") as f:
            json.dump(_empty_db(), f, indent=2)
    logger.info("File database initialised at %s", DB_FILE.resolve())
