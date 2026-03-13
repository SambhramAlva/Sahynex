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
    }


class FileDB:
    def __init__(self, file_path: Path):
        self.file_path = file_path

    async def _read(self):
        if not self.file_path.exists():
            return _empty_db()
        try:
            with self.file_path.open("r", encoding="utf-8") as f:
                return json.load(f)
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

    async def delete_repo_for_user(self, user_id: str):
        async with _LOCK:
            db = await self._read()
            db["repos"] = [r for r in db["repos"] if r["user_id"] != user_id]
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
