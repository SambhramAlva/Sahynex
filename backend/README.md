# gitAgent 🤖

AI-powered GitHub issue resolver — **Google ADK + MCP + FastAPI + React**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React + Tailwind)                                  │
│  ├── Auth (login/signup)                                     │
│  ├── Dashboard, Issues, Commits, Review, Resolver, Inbox    │
│  └── WebSocket client  ──────────────────────────────────┐  │
└──────────────────────────────────┬──────────────────────── │ ─┘
                                   │ REST                    │ WS
┌──────────────────────────────────▼──────────────────────── ▼ ─┐
│  FastAPI Backend                                              │
│  ├── /api/auth         JWT auth (signup/login)               │
│  ├── /api/repos        GitHub repo connect/disconnect        │
│  ├── /api/issues       Proxy GitHub Issues API               │
│  ├── /api/agent        Run pipeline, merge, inbox, logs      │
│  ├── /api/webhooks     Optional GitHub webhook receiver      │
│  └── /api/agent/ws     WebSocket broadcast hub               │
│                                                              │
│  Google ADK Pipeline (background asyncio task)              │
│  ├── CoderAgent    — fetch issue → branch → fix → PR        │
│  ├── ReviewerAgent — inspect diff → risk level + summary    │
│  └── GatekeeperAgent — prepare merge request message        │
│             ↓ waits for /merge endpoint approval             │
│  MergeAgent — squash merge PR → delete branch               │
│                                                              │
│  GitHub MCP Server  (@modelcontextprotocol/server-github)   │
│  └── Runs as npx subprocess per agent run                   │
└──────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  SQLite (dev) / Postgres     │
                    │  users, repos, agent_runs,   │
                    │  run_logs, inbox_messages     │
                    └──────────────────────────────┘
```

---

## Quick Start

### 1. Prerequisites

- Python 3.12+
- Node.js 20+ (for the GitHub MCP server)
- A [Google AI Studio](https://aistudio.google.com) API key
- A GitHub Personal Access Token with `repo`, `issues`, `pull_requests` scopes

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env — fill in GOOGLE_API_KEY, JWT_SECRET_KEY, FERNET_KEY

python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

uvicorn main:app --reload
# → http://localhost:8000
# → docs at http://localhost:8000/docs
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env             # set VITE_API_URL=http://localhost:8000
npm install
npm run dev
# → http://localhost:5173
```

### 4. Docker (full stack)

```bash
# Set env vars
export GOOGLE_API_KEY=...
export JWT_SECRET_KEY=...
export FERNET_KEY=...

docker compose up --build
# Frontend → http://localhost:5173
# Backend  → http://localhost:8000
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_API_KEY` | ✅ | Google AI Studio key for Gemini |
| `ADK_MODEL` | | Gemini model (default: `gemini-2.0-flash`) |
| `JWT_SECRET_KEY` | ✅ | 32+ char random string for JWT signing |
| `FERNET_KEY` | ✅ | Fernet key for encrypting GitHub tokens at rest |
| `DATABASE_URL` | | Path to SQLite file or Postgres URL |
| `ALLOWED_ORIGINS` | | Comma-separated CORS origins |
| `GITHUB_WEBHOOK_SECRET` | | For webhook signature validation |

---

## API Reference

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/signup` | Create account → returns JWT |
| POST | `/api/auth/login` | Login → returns JWT |

### Repos
| Method | Path | Description |
|---|---|---|
| POST | `/api/repos/connect` | Connect GitHub repo (validates token) |
| GET | `/api/repos/current` | Get connected repo |
| DELETE | `/api/repos/disconnect` | Remove repo connection |

### Issues
| Method | Path | Description |
|---|---|---|
| GET | `/api/issues` | List issues (`?state=open\|closed\|all`) |
| GET | `/api/issues/{number}` | Single issue |

### Agent
| Method | Path | Description |
|---|---|---|
| POST | `/api/agent/run` | Start agent pipeline for an issue |
| GET | `/api/agent/runs` | List all runs |
| GET | `/api/agent/runs/{id}` | Run detail |
| GET | `/api/agent/runs/{id}/logs` | Execution logs |
| POST | `/api/agent/runs/{id}/merge` | Approve or reject merge |
| GET | `/api/agent/inbox` | Inbox messages |
| PATCH | `/api/agent/inbox/{id}/read` | Mark message read |
| WS | `/api/agent/ws/{user_id}?token=JWT` | Real-time events |

### WebSocket Events
```json
{ "event": "log",            "run_id": "...", "data": { "phase": "coding", "level": "info", "message": "..." } }
{ "event": "status_change",  "run_id": "...", "data": { "status": "awaiting_approval" } }
{ "event": "inbox_new",      "run_id": "...", "data": { "id": "...", "title": "...", ... } }
{ "event": "merge_request",  "run_id": "...", "data": { "pr_number": 42, "pr_url": "...", "summary": "..." } }
```

---

## Agent Pipeline Detail

```
issue_number → CoderAgent
  ├── get_issue (GitHub MCP)
  ├── create_branch → fix/issue-{N}
  ├── get_file_contents → analyse
  ├── create_or_update_file → apply fix
  ├── commit
  └── create_pull_request → output: {branch_name, pr_number, pr_url, ...}
             ↓
         ReviewerAgent
  ├── get_pull_request
  ├── list_pull_request_files → inspect diff
  └── output: {risk_level, summary, test_coverage, breaking_changes}
             ↓
        GatekeeperAgent
  └── output: {merge_message, steps, pr_number}
             ↓
    ⏸  awaiting_approval  (WebSocket → inbox notification → UI)
             ↓  human clicks "Approve & Merge"
          MergeAgent
  ├── merge_pull_request (squash)
  └── delete_branch
```

---

## Project Structure

```
gitAgent/
├── backend/
│   ├── main.py              # FastAPI app + lifespan
│   ├── database.py          # SQLite init + get_db dependency
│   ├── schemas.py           # Pydantic models
│   ├── auth_utils.py        # JWT + bcrypt + Fernet
│   ├── ws_manager.py        # WebSocket broadcast hub
│   ├── agent_pipeline.py    # Google ADK pipeline (core)
│   ├── routers/
│   │   ├── auth.py
│   │   ├── repos.py
│   │   ├── issues.py
│   │   ├── agent.py         # runs, logs, merge, inbox, WS
│   │   └── webhooks.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   └── src/App.jsx          # React frontend (see frontend README)
├── docker-compose.yml
└── README.md
```

---

## Connecting the Frontend

In `frontend/src/App.jsx`, replace mock data with API calls:

```js
// Example: load real issues
const API = import.meta.env.VITE_API_URL;

const issues = await fetch(`${API}/api/issues`, {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => r.json());

// Start agent run
await fetch(`${API}/api/agent/run`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ issue_number: 42 })
});

// WebSocket for live logs
const WS = import.meta.env.VITE_WS_URL;
const socket = new WebSocket(`${WS}/api/agent/ws/${userId}?token=${token}`);
socket.onmessage = e => {
  const { event, run_id, data } = JSON.parse(e.data);
  // update UI state
};
```
