"""Auth endpoints with GitHub OAuth login."""

import json
import os
import urllib.parse
import uuid
from datetime import datetime, timezone
import httpx
from fastapi import APIRouter, HTTPException, Depends, status, Request, Query
from fastapi.responses import RedirectResponse, HTMLResponse

from database import get_db, FileDB
from schemas import SignUpRequest, LoginRequest, TokenResponse, UserOut
from auth_utils import hash_password, verify_password, create_access_token, encrypt_token

router = APIRouter()


def _github_oauth_config(request: Request) -> tuple[str, str, str]:
    client_id = os.getenv("GITHUB_CLIENT_ID", "").strip()
    client_secret = os.getenv("GITHUB_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("GITHUB_OAUTH_REDIRECT_URI", "").strip() or str(request.url_for("github_callback"))

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=503,
            detail="GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
        )

    return client_id, client_secret, redirect_uri


@router.get("/github/config")
async def github_config(request: Request):
    client_id = os.getenv("GITHUB_CLIENT_ID", "").strip()
    client_secret = os.getenv("GITHUB_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("GITHUB_OAUTH_REDIRECT_URI", "").strip() or str(request.url_for("github_callback"))
    return {
        "configured": bool(client_id and client_secret),
        "redirect_uri": redirect_uri,
    }


@router.get("/github/start")
async def github_start(request: Request):
    client_id, _client_secret, redirect_uri = _github_oauth_config(request)
    state = str(uuid.uuid4())
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "read:user user:email repo",
        "state": state,
        "allow_signup": "true",
    }
    url = f"https://github.com/login/oauth/authorize?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url)


@router.get("/github/callback", name="github_callback", response_class=HTMLResponse)
async def github_callback(
    request: Request,
    code: str = Query(...),
    db: FileDB = Depends(get_db),
):
    client_id, client_secret, redirect_uri = _github_oauth_config(request)

    async with httpx.AsyncClient(timeout=20) as client:
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            headers={"Accept": "application/json"},
        )

        if token_response.status_code != 200:
            raise HTTPException(status_code=502, detail=f"GitHub token exchange failed: {token_response.text}")

        token_data = token_response.json()
        github_token = token_data.get("access_token")
        if not github_token:
            raise HTTPException(status_code=401, detail="GitHub OAuth did not return an access token")

        user_response = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {github_token}", "Accept": "application/vnd.github+json"},
        )
        if user_response.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Failed to fetch GitHub user: {user_response.text}")

        github_user = user_response.json()
        emails_response = await client.get(
            "https://api.github.com/user/emails",
            headers={"Authorization": f"Bearer {github_token}", "Accept": "application/vnd.github+json"},
        )

    github_id = str(github_user.get("id"))
    github_login = github_user.get("login")
    if not github_id or not github_login:
        raise HTTPException(status_code=502, detail="GitHub user data is incomplete")

    email = github_user.get("email")
    if emails_response.status_code == 200:
        emails = emails_response.json() or []
        primary = next((item.get("email") for item in emails if item.get("primary")), None)
        verified = next((item.get("email") for item in emails if item.get("verified")), None)
        email = primary or verified or email
    email = email or f"{github_login}@users.noreply.github.com"
    name = github_user.get("name") or github_login

    existing = await db.get_user_by_github_id(github_id)
    now_iso = datetime.now(timezone.utc).isoformat()
    if existing:
        user_id = existing["id"]
        await db.update_user(
            user_id,
            {
                "name": name,
                "email": email,
                "github_id": github_id,
                "github_login": github_login,
                "github_token_enc": encrypt_token(github_token),
                "updated_at": now_iso,
            },
        )
    else:
        user_id = str(uuid.uuid4())
        await db.add_user(
            {
                "id": user_id,
                "name": name,
                "email": email,
                "password_hash": hash_password(str(uuid.uuid4())),
                "github_id": github_id,
                "github_login": github_login,
                "github_token_enc": encrypt_token(github_token),
                "created_at": now_iso,
            }
        )

    app_token = create_access_token(user_id)
    payload = {
        "source": "gitagent_oauth",
        "access_token": app_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "name": name,
            "email": email,
            "github_login": github_login,
        },
    }
    payload_json = json.dumps(payload).replace("</", "<\\/")
    payload_url = urllib.parse.quote(json.dumps(payload), safe="")
    frontend_url = os.getenv("FRONTEND_APP_URL", "http://localhost:5173").rstrip("/")

    html = f"""
<!doctype html>
<html>
  <head><meta charset=\"utf-8\"><title>GitHub Login Complete</title></head>
  <body style=\"font-family: system-ui, -apple-system, Segoe UI, sans-serif; background:#0b1118; color:#e7edf4; padding:24px;\">
    <h3>GitHub login complete</h3>
    <p>You can close this window.</p>
    <script>
      (function() {{
        var payload = {payload_json};
        if (window.opener) {{
          window.opener.postMessage(payload, '*');
          window.close();
                    return;
        }}
                window.location.replace('{frontend_url}/?oauth=' + encodeURIComponent(JSON.stringify(payload)));
      }})();
    </script>
  </body>
</html>
"""
    return HTMLResponse(content=html)


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignUpRequest, db: FileDB = Depends(get_db)):
    existing = await db.get_user_by_email(body.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    uid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    user = {
        "id": uid,
        "name": body.name.strip(),
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "created_at": now,
    }
    await db.add_user(user)

    token = create_access_token(uid)
    return TokenResponse(
        access_token=token,
        user=UserOut(id=uid, name=user["name"], email=user["email"], github_login=user.get("github_login")),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: FileDB = Depends(get_db)):
    user = await db.get_user_by_email(body.email)
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(user["id"])
    return TokenResponse(
        access_token=token,
        user=UserOut(id=user["id"], name=user["name"], email=user["email"], github_login=user.get("github_login")),
    )
