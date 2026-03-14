"""Update GitHub issue webhook URL for all connected repos in local file DB.

Usage:
  python backend/scripts/update_webhook_url.py --url https://api.example.com/api/webhooks/github
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from auth_utils import decrypt_token  # noqa: E402


DEFAULT_DB_PATH = ROOT / "gitAgent.json"


def _build_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def update_webhook_url(webhook_url: str, db_path: Path) -> None:
    if not db_path.exists():
        raise RuntimeError(f"DB file not found: {db_path}")

    payload = json.loads(db_path.read_text(encoding="utf-8"))
    repos = payload.get("repos") or []
    if not repos:
        print("No connected repos found.")
        return

    for repo in repos:
        repo_name = repo.get("repo_full_name")
        token_enc = repo.get("github_token_enc")
        if not repo_name or not token_enc:
            continue

        token = decrypt_token(token_enc)
        headers = _build_headers(token)

        async with httpx.AsyncClient(timeout=20, headers=headers) as client:
            hooks_resp = await client.get(f"https://api.github.com/repos/{repo_name}/hooks")
            if hooks_resp.status_code != 200:
                print(f"[{repo_name}] failed to list hooks: {hooks_resp.status_code} {hooks_resp.text[:200]}")
                continue

            hooks = hooks_resp.json() or []
            existing = next(
                (
                    hook
                    for hook in hooks
                    if ((hook.get("config") or {}).get("url", "").endswith("/api/webhooks/github"))
                ),
                None,
            )

            if existing:
                update_payload = {
                    "active": True,
                    "events": ["issues"],
                    "config": {
                        "url": webhook_url,
                        "content_type": "json",
                        "insecure_ssl": "0",
                    },
                }
                update_resp = await client.patch(existing["url"], json=update_payload)
                if update_resp.status_code == 200:
                    print(f"[{repo_name}] updated webhook -> {webhook_url}")
                else:
                    print(f"[{repo_name}] failed to update webhook: {update_resp.status_code} {update_resp.text[:200]}")
            else:
                create_payload = {
                    "name": "web",
                    "active": True,
                    "events": ["issues"],
                    "config": {
                        "url": webhook_url,
                        "content_type": "json",
                        "insecure_ssl": "0",
                    },
                }
                create_resp = await client.post(f"https://api.github.com/repos/{repo_name}/hooks", json=create_payload)
                if create_resp.status_code == 201:
                    print(f"[{repo_name}] created webhook -> {webhook_url}")
                else:
                    print(f"[{repo_name}] failed to create webhook: {create_resp.status_code} {create_resp.text[:200]}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Update GitHub webhook URL for connected repos")
    parser.add_argument("--url", required=True, help="Full webhook URL (must end with /api/webhooks/github)")
    parser.add_argument("--db", default=str(DEFAULT_DB_PATH), help="Path to gitAgent JSON DB")
    args = parser.parse_args()

    if not args.url.startswith("http"):
        raise SystemExit("--url must be a full http/https URL")
    if not args.url.endswith("/api/webhooks/github"):
        raise SystemExit("--url must end with /api/webhooks/github")

    asyncio.run(update_webhook_url(args.url, Path(args.db)))


if __name__ == "__main__":
    main()
