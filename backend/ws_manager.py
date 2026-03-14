"""
WebSocket connection manager.

Each authenticated user gets a room keyed by user_id.
The agent broadcasts run logs, status changes, and inbox notifications
into the room so the React frontend updates in real time.
"""

import json
import logging
from collections import defaultdict
from typing import Dict, List

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # user_id → list of active WebSocket connections
        self._rooms: Dict[str, List[WebSocket]] = defaultdict(list)

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self._rooms[user_id].append(ws)
        logger.info("WS connected: user=%s  total=%d", user_id, len(self._rooms[user_id]))

    def register(self, user_id: str, ws: WebSocket):
        """Register a socket that has already been accepted upstream."""
        self._rooms[user_id].append(ws)
        logger.info("WS registered: user=%s  total=%d", user_id, len(self._rooms[user_id]))

    def disconnect(self, user_id: str, ws: WebSocket):
        self._rooms[user_id].discard(ws) if hasattr(self._rooms[user_id], "discard") else None
        try:
            self._rooms[user_id].remove(ws)
        except ValueError:
            pass
        logger.info("WS disconnected: user=%s  remaining=%d", user_id, len(self._rooms[user_id]))

    async def broadcast(self, user_id: str, event: str, data: dict, run_id: str | None = None):
        """Send a JSON event to every socket in a user's room."""
        payload = json.dumps({"event": event, "run_id": run_id, "data": data})
        dead = []
        for ws in self._rooms.get(user_id, []):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

    async def broadcast_log(self, user_id: str, run_id: str, phase: str, level: str, message: str):
        await self.broadcast(user_id, "log", {
            "phase": phase, "level": level, "message": message
        }, run_id=run_id)

    async def broadcast_status(self, user_id: str, run_id: str, status: str, **extra):
        await self.broadcast(user_id, "status_change", {"status": status, **extra}, run_id=run_id)

    async def broadcast_inbox(self, user_id: str, message: dict):
        await self.broadcast(user_id, "inbox_new", message)

    async def broadcast_merge_request(self, user_id: str, run_id: str, pr_number: int, pr_url: str, summary: str):
        await self.broadcast(user_id, "merge_request", {
            "pr_number": pr_number, "pr_url": pr_url, "summary": summary
        }, run_id=run_id)


# Singleton used across routers and the agent
manager = ConnectionManager()
