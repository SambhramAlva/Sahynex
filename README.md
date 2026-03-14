# Sahynex

Sahynex is a GitHub issue-to-PR workflow app with a React frontend and FastAPI backend. It connects to a GitHub repository, tracks issues, runs an AI-assisted solve flow, opens pull requests, and keeps review activity visible in a dashboard-style interface.

## Stack

- Frontend: React, Vite, Tailwind utilities
- Backend: FastAPI
- AI flow: Ollama-based issue solver
- Storage: local JSON file persistence for development

## Core workflow

1. Sign in to the app.
2. Connect a GitHub repository with a Personal Access Token.
3. Open issues are synced into the app.
4. The agent can queue and solve issues, create PRs, and move items into review.
5. Solved issues are separated from active issues and can be retried manually if needed.

## GitHub token behavior

- The GitHub token is required the first time a repository is connected.
- After the first successful repo connection, the token is stored and reused for future repo additions.
- When adding another repository later, the app uses the stored token automatically.
- If needed, you can still override it by choosing a different token while adding a repo.
- You can update the saved GitHub token anytime from the Profile page.

## Profile features

- View connected repositories
- Edit the saved GitHub token
- Disconnect the current repository
- Log out of the app

## Issue lifecycle behavior

- Active issues and solved issues are shown separately.
- When a PR is prepared for an issue, the issue is moved out of the active list.
- Solved issues persist across reloads and relogin.
- Solved issues include a manual retry action.

## Loading feedback

- Buttons that trigger slower actions show local loading states.
- The app also shows a global top loading bar for user-triggered async actions.

## Local development

### Frontend

```bash
npm install
npm run dev:frontend
```

### Backend

Use the Python environment already configured for the workspace, then run the backend from the `backend` directory.

```bash
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

## Production build

```bash
npm run build
```

## Notes

- The frontend can proxy backend requests for a single public URL setup.
- The development setup has been tuned for ngrok-based access.
- GitHub token validation happens server-side before a repo or updated token is accepted.
