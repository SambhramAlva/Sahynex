# GitAgent — AI-Powered GitHub Issue Agent

> Automatically solves GitHub issues using Ollama, creates branches, writes code, opens pull requests, and waits for your approval before merging — all from a single dashboard.

![Python](https://img.shields.io/badge/Python-3.12-blue)
![React](https://img.shields.io/badge/React-19-blue)
![License](https://img.shields.io/badge/License-MIT-green)
![AI](https://img.shields.io/badge/AI-Gemini-orange)

---

## Overview

Developers spend significant time converting GitHub issues into working code changes.
GitAgent automates this workflow using an AI agent powered by Ollama.

The system reads issues, analyzes the repository, generates code changes, opens pull requests, and presents them to developers for approval.

Instead of manually implementing fixes, developers can review AI-generated solutions and merge them with one click.

---

## Table of Contents

* Overview
* What It Does
* Key Features
* Tech Stack
* Project Structure
* Quick Start
* Environment Variables
* How the Agent Works
* Example Workflow
* GitHub Webhook Setup
* API Overview
* Screenshots
* Roadmap
* Contributing
* Author
* License

---

# What It Does

1. **Connects to your GitHub repo** — link any repository with a Personal Access Token.
2. **Watches for issues** — via GitHub webhooks or manual triggers in the UI.
3. **Runs an AI agent pipeline** — powered by Google ADK + Gemini, which:

   * Reads the issue description
   * Creates a dedicated `agent/issue-N` branch
   * Inspects and edits relevant source files
   * Opens a Pull Request with a full description
   * Reviews its own changes for risk and correctness
4. **Shows you a diff review** — renders changed files, patch lines, and a risk summary.
5. **Waits for your approval** — one-click approve/merge or reject in the Review page.
6. **Streams live progress** — real-time log updates over WebSocket as the agent works.

---

# Key Features

* Automated **Issue → Pull Request** workflow
* AI-generated code using **Google Gemini**
* Safe workflow with **human approval before merge**
* Real-time **WebSocket progress updates**
* GitHub integration via **Model Context Protocol**
* Clean **dashboard for monitoring agent runs**
* Built-in **risk analysis for code changes**

---

# Tech Stack

| Layer        | Technology                                                     |
| ------------ | -------------------------------------------------------------- |
| Frontend     | React 19, Vite, Tailwind CSS                                   |
| Backend      | FastAPI (Python 3.12+), Uvicorn                                |
| AI Agent     | Google ADK 1.27+, Gemini 2.0 Flash                             |
| GitHub Tools | Model Context Protocol (`@modelcontextprotocol/server-github`) |
| Real-time    | WebSockets (FastAPI native)                                    |
| Storage      | File-based JSON DB (dev)                                       |
| Auth         | JWT + Fernet-encrypted token storage                           |

---

# Architecture

```
Issue Created
      ↓
Webhook Trigger / Manual Run
      ↓
Agent Pipeline
      ↓
Coder Agent (Gemini)
      ↓
Creates Branch + Code Changes
      ↓
Pull Request Created
      ↓
Reviewer Agent
      ↓
Risk Analysis + Summary
      ↓
Developer Approval
      ↓
Merge PR
```

---

# Project Structure

```
GitAgent/
├── src/                        # React frontend
│   ├── App.jsx                 # Root app, session auth, routing
│   ├── components/
│   │   ├── auth/               # Login, signup, repo setup
│   │   ├── layout/             # Sidebar navigation
│   │   ├── pages/              # Dashboard, Issues, Review, Resolver, Inbox
│   │   └── ui/                 # Shared UI components
│   └── data/mockData.js
│
├── backend/
│   ├── main.py                 # FastAPI app entry point
│   ├── agent.py                # Agent pipeline lifecycle
│   ├── agent_pipeline.py       # ADK SequentialAgent definitions
│   ├── auth.py                 # Authentication routes
│   ├── auth_utils.py           # JWT utilities
│   ├── repos.py                # GitHub repo connect/disconnect
│   ├── issues.py               # GitHub Issues proxy API
│   ├── webhooks.py             # GitHub webhook receiver
│   ├── database.py             # File-based JSON database
│   ├── ws_manager.py           # WebSocket manager
│   ├── schemas.py              # Pydantic schemas
│   ├── .env.example
│   └── requirements.txt
│
├── package.json
└── README.md
```

---

# Quick Start

## Prerequisites

* Python **3.12+**
* Node.js **20+**
* A **Google AI Studio API key**
* A **GitHub Personal Access Token** with
  `repo`, `issues`, `pull_requests` scopes

---

## 1. Clone the repository

```bash
git clone https://github.com/SambhramAlva/GitAgent.git
cd GitAgent
npm install
```

---

## 2. Configure backend

```bash
cd backend
cp .env.example .env
```

Edit `.env`:

```
GOOGLE_API_KEY=your_google_ai_studio_key
JWT_SECRET_KEY=at_least_32_random_characters
FERNET_KEY=your_fernet_key
ADK_MODEL=gemini-2.0-flash
```

Generate a Fernet key:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

## 3. Install backend dependencies

```bash
pip install -r backend/requirements.txt
```

---

## 4. Run the application

```bash
npm run dev
```

This starts:

* Frontend → `http://localhost:5173`
* Backend → `http://localhost:8011`

---

# Environment Variables

| Variable              | Required | Description                               |
| --------------------- | -------- | ----------------------------------------- |
| GOOGLE_API_KEY        | ✅        | Google AI Studio key                      |
| JWT_SECRET_KEY        | ✅        | Random string for signing JWT tokens      |
| FERNET_KEY            | ✅        | Encrypts stored GitHub tokens             |
| ADK_MODEL             | Optional | Gemini model (default `gemini-2.0-flash`) |
| ALLOWED_ORIGINS       | Optional | CORS allowed origins                      |
| GITHUB_WEBHOOK_SECRET | Optional | Webhook signature verification            |

---

# How the Agent Works

```
Issue opened (webhook / manual)
        │
        ▼
Queue run in DB
        │
        ▼
CoderAgent
(Gemini + GitHub MCP)
        │
        ├─ reads issue
        ├─ creates branch
        ├─ edits files
        └─ opens PR
        │
        ▼
ReviewerAgent
        │
        ├─ analyzes diff
        ├─ assigns risk level
        └─ writes review summary
        │
        ▼
Status: awaiting_approval
        │
User clicks Approve
        │
        ▼
Squash merge PR → delete branch
        │
        ▼
Status: merged
```

Each step streams live logs to the frontend over **WebSockets**.

---

# Example Workflow

1. Connect your GitHub repository.
2. Create or select a GitHub issue.
3. Trigger the GitAgent agent.
4. The agent:

   * creates a branch
   * edits relevant files
   * commits changes
   * opens a pull request
5. Reviewer agent analyzes the PR.
6. Review the diff in the dashboard.
7. Approve or reject the merge.

---

# GitHub Webhook Setup (Optional)

To automatically trigger runs when issues are opened:

1. Go to your repository
   **Settings → Webhooks → Add webhook**

2. Payload URL

```
https://your-server/api/webhooks/github
```

3. Content Type

```
application/json
```

4. Events

```
Issues
```

5. Set `GITHUB_WEBHOOK_SECRET` in `.env`.

---

# API Overview

| Method | Endpoint                       | Description             |
| ------ | ------------------------------ | ----------------------- |
| POST   | `/api/auth/signup`             | Register account        |
| POST   | `/api/auth/login`              | Login and receive JWT   |
| POST   | `/api/repos/connect`           | Connect GitHub repo     |
| GET    | `/api/issues`                  | List repository issues  |
| POST   | `/api/agent/run`               | Trigger agent run       |
| GET    | `/api/agent/runs`              | List all runs           |
| GET    | `/api/agent/runs/{id}/logs`    | Fetch run logs          |
| GET    | `/api/agent/runs/{id}/changes` | View PR diffs           |
| POST   | `/api/agent/runs/{id}/merge`   | Approve or reject merge |
| GET    | `/api/agent/inbox`             | Notifications           |
| WS     | `/api/agent/ws/{user_id}`      | WebSocket updates       |
| POST   | `/api/webhooks/github`         | GitHub webhook          |

---

# Screenshots

Screenshots will appear here once:

* a repository is connected
* an agent run is executed
* review diff view is opened

---

# Roadmap

Planned improvements:

* Multi-repository support
* AI-generated test cases
* CI/CD integration
* Security vulnerability scanning
* PostgreSQL database support
* Multiple AI model providers

---

# Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch

```
git checkout -b feature/new-feature
```

3. Commit changes

```
git commit -m "Add new feature"
```

4. Push to GitHub

```
git push origin feature/new-feature
```

5. Open a Pull Request

---

# License

MIT License
