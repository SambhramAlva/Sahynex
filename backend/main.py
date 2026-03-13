"""
gitAgent Backend — FastAPI + Google ADK + GitHub MCP
Entry point: uvicorn main:app --reload
"""

import os
import asyncio
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import auth
import repos
import issues

try:
    import agent
except Exception:  # Optional in local dev when ADK deps are unavailable.
    agent = None

try:
    import webhooks
except Exception:
    webhooks = None
from database import init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting gitAgent backend …")
    await init_db()
    yield
    logger.info("Shutting down gitAgent backend …")


app = FastAPI(
    title="gitAgent API",
    description="AI-powered GitHub issue resolver using Google ADK + MCP",
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174",
    ).split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────
app.include_router(auth.router,     prefix="/api/auth",     tags=["auth"])
app.include_router(repos.router,    prefix="/api/repos",    tags=["repos"])
app.include_router(issues.router,   prefix="/api/issues",   tags=["issues"])
if agent is not None:
    app.include_router(agent.router,    prefix="/api/agent",    tags=["agent"])
if webhooks is not None:
    app.include_router(webhooks.router, prefix="/api/webhooks", tags=["webhooks"])


@app.get("/healthz")
async def health():
    return {"status": "ok", "version": "0.1.0"}
