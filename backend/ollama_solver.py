import base64
import asyncio
import difflib
import json
import re
import time
import uuid
from typing import Any

import httpx
import ollama

MODEL = "qwen2.5-coder:7b"
MAX_CONTEXT_FILES = 8
MAX_CHANGED_FILES = 4
TREE_CACHE_TTL_SECONDS = 300
ALLOWED_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".css", ".scss", ".html", ".json",
    ".yml", ".yaml", ".toml", ".ini", ".env", ".md", ".txt", ".java", ".kt",
    ".go", ".rs", ".rb", ".php", ".cs", ".swift", ".sql", ".sh", ".ps1", ".c",
    ".cpp", ".h", ".hpp",
}

_TREE_CACHE: dict[str, tuple[float, list[str]]] = {}


class SolverError(RuntimeError):
    pass


def _extension(path: str) -> str:
    idx = path.rfind(".")
    return path[idx:].lower() if idx >= 0 else ""


def _is_allowed_path(path: str) -> bool:
    clean = path.strip().lstrip("/")
    if not clean or ".." in clean:
        return False
    extension = _extension(clean)
    if extension and extension not in ALLOWED_EXTENSIONS:
        return False
    blocked = ("node_modules/", "dist/", "build/", "__pycache__/", ".git/")
    if any(part in clean for part in blocked):
        return False
    return True


def _extract_json_object(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    if not raw:
        return {}

    # Try fenced JSON blocks first.
    fenced = re.findall(r"```json\s*(\{[\s\S]*?\})\s*```", raw, flags=re.IGNORECASE)
    for block in fenced:
        try:
            return json.loads(block)
        except Exception:
            continue

    try:
        return json.loads(raw)
    except Exception:
        pass

    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(raw[start : end + 1])
        except Exception:
            return {}
    return {}


def _format_issue_pattern_error(problems: list[str]) -> str:
    example = (
        "Example: FilePath: src/App.jsx | Changes: stop websocket reconnect after auth failure. "
        "Also accepted: 'File Path - src/App.jsx' with 'Change:' or 'Instructions:' lines."
    )
    if not problems:
        return f"Invalid issue description format. {example}"
    return f"Invalid issue description format. {'; '.join(problems)}. {example}"


def _normalize_user_path(raw: str) -> str:
    return (
        (raw or "")
        .strip()
        .strip("`\"' ")
        .replace("\\", "/")
        .lstrip("./")
        .lstrip("/")
    )


def _resolve_candidate_path(requested_path: str, candidates: list[str]) -> tuple[str | None, str | None]:
    normalized = _normalize_user_path(requested_path)
    if not normalized:
        return None, "empty file path"

    candidate_map = {candidate.lower(): candidate for candidate in candidates}

    exact = candidate_map.get(normalized.lower())
    if exact:
        return exact, None

    # Support suffix matching like 'App.jsx' or 'src\\App.jsx'.
    suffix_matches = [c for c in candidates if c.lower().endswith(normalized.lower())]
    if len(suffix_matches) == 1:
        return suffix_matches[0], None
    if len(suffix_matches) > 1:
        return None, f"ambiguous FilePath '{requested_path}' matched multiple files"

    # Last fallback: match by basename when unique.
    basename = normalized.split("/")[-1].lower()
    if basename:
        basename_matches = [c for c in candidates if c.split("/")[-1].lower() == basename]
        if len(basename_matches) == 1:
            return basename_matches[0], None
        if len(basename_matches) > 1:
            return None, f"ambiguous FilePath '{requested_path}' by filename"

    return None, f"unknown FilePath '{requested_path}'"


def _extract_issue_file_instructions(
    issue_body: str, candidates: list[str]
) -> tuple[list[dict[str, str]], list[str]]:
    normalized_body = (issue_body or "").replace("\r\n", "\n").replace("\\", "/")
    instructions: list[dict[str, str]] = []
    problems: list[str] = []
    current_path: str | None = None
    current_changes: list[str] = []

    filepath_re = re.compile(r"^[\s>*\-]*file\s*path\s*[:\-]\s*(.+)$", re.IGNORECASE)
    changes_re = re.compile(r"^[\s>*\-]*(changes?|instructions?)\s*[:\-]\s*(.*)$", re.IGNORECASE)

    def flush_instruction():
        nonlocal current_path, current_changes
        if not current_path:
            return
        normalized_path, path_problem = _resolve_candidate_path(current_path, candidates)
        change_text = "\n".join(current_changes).strip()
        if path_problem:
            problems.append(path_problem)
        elif not change_text:
            problems.append(f"missing Changes content for '{current_path}'")
        else:
            instructions.append({"path": normalized_path, "changes": change_text})
        current_path = None
        current_changes = []

    lines = normalized_body.split("\n")
    idx = 0
    while idx < len(lines):
        line = lines[idx]
        path_match = filepath_re.match(line.strip())
        if path_match:
            flush_instruction()
            current_path = _normalize_user_path(path_match.group(1))
            idx += 1
            if idx < len(lines):
                change_match = changes_re.match(lines[idx].strip())
            else:
                change_match = None
            if change_match:
                first_change_line = change_match.group(2).strip()
                if first_change_line:
                    current_changes.append(first_change_line)
            idx += 1
            while idx < len(lines) and not filepath_re.match(lines[idx].strip()):
                current_changes.append(lines[idx])
                idx += 1
            continue
        idx += 1

    flush_instruction()

    if instructions:
        return instructions, problems

    # Fallback mode: accept free-form issues that mention target files inline.
    raw_mentions = []
    raw_mentions.extend(re.findall(r"`([^`]+\.[A-Za-z0-9]+)`", normalized_body))
    raw_mentions.extend(re.findall(r"\b([A-Za-z0-9_\-./]+\.[A-Za-z0-9]+)\b", normalized_body))

    resolved_paths: list[str] = []
    seen = set()
    for mention in raw_mentions:
        path, err = _resolve_candidate_path(mention, candidates)
        if err or not path:
            continue
        if path in seen:
            continue
        seen.add(path)
        resolved_paths.append(path)
        if len(resolved_paths) >= MAX_CHANGED_FILES:
            break

    if resolved_paths:
        generic_change_text = normalized_body.strip()
        fallback_instructions = [{"path": p, "changes": generic_change_text} for p in resolved_paths]
        return fallback_instructions, []

    return instructions, problems


async def _github_request(method: str, url: str, token: str, **kwargs) -> httpx.Response:
    headers = kwargs.pop("headers", {})
    headers.update(
        {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
    )
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.request(method, url, headers=headers, **kwargs)
    return response


async def validate_push_access(repo_name: str, token: str) -> None:
    repo_info = await get_repo_info(repo_name, token)
    permissions = repo_info.get("permissions") or {}
    if permissions and not permissions.get("push", False):
        raise SolverError("GitHub token does not have push access to this repository.")


async def get_repo_info(repo_name: str, token: str) -> dict[str, Any]:
    response = await _github_request("GET", f"https://api.github.com/repos/{repo_name}", token)
    if response.status_code != 200:
        raise SolverError(f"Cannot access repository: {response.status_code} {response.text}")
    return response.json()


async def get_issue_details(repo_name: str, issue_number: int, token: str) -> dict[str, Any]:
    response = await _github_request(
        "GET", f"https://api.github.com/repos/{repo_name}/issues/{issue_number}", token
    )
    if response.status_code != 200:
        raise SolverError(f"Failed to fetch issue: {response.status_code} {response.text}")
    return response.json()


async def get_default_branch(repo_name: str, token: str) -> str:
    repo_info = await get_repo_info(repo_name, token)
    return repo_info.get("default_branch", "main")


async def get_branch_sha(repo_name: str, branch: str, token: str) -> str:
    response = await _github_request(
        "GET", f"https://api.github.com/repos/{repo_name}/git/ref/heads/{branch}", token
    )
    if response.status_code != 200:
        raise SolverError(f"Failed to resolve branch ref: {response.status_code} {response.text}")
    return response.json()["object"]["sha"]


async def get_repo_candidate_files(repo_name: str, base_sha: str, token: str) -> list[str]:
    cache_key = f"{repo_name}@{base_sha}"
    cached = _TREE_CACHE.get(cache_key)
    now = time.time()
    if cached and now - cached[0] < TREE_CACHE_TTL_SECONDS:
        return cached[1]

    response = await _github_request(
        "GET", f"https://api.github.com/repos/{repo_name}/git/trees/{base_sha}?recursive=1", token
    )
    if response.status_code != 200:
        raise SolverError(f"Failed to fetch repository tree: {response.status_code} {response.text}")

    tree = response.json().get("tree") or []
    files = [item.get("path", "") for item in tree if item.get("type") == "blob"]
    allowed = [p for p in files if _is_allowed_path(p)]
    _TREE_CACHE[cache_key] = (now, allowed)
    return allowed


async def get_file_content(repo_name: str, file_path: str, token: str) -> str:
    response = await _github_request(
        "GET", f"https://api.github.com/repos/{repo_name}/contents/{file_path}", token
    )
    if response.status_code != 200:
        raise SolverError(f"Failed to fetch file {file_path}: {response.status_code} {response.text}")

    data = response.json()
    content = data.get("content", "")
    if data.get("encoding") == "base64":
        return base64.b64decode(content).decode("utf-8", errors="replace")
    return content


async def create_branch(repo_name: str, branch_name: str, base_sha: str, token: str) -> str:
    response = await _github_request(
        "POST",
        f"https://api.github.com/repos/{repo_name}/git/refs",
        token,
        json={"ref": f"refs/heads/{branch_name}", "sha": base_sha},
    )
    if response.status_code == 201:
        return branch_name
    if response.status_code == 422:
        # Branch already exists. Create a unique one to avoid collisions.
        retry = f"{branch_name}-{str(uuid.uuid4())[:6]}"
        retry_response = await _github_request(
            "POST",
            f"https://api.github.com/repos/{repo_name}/git/refs",
            token,
            json={"ref": f"refs/heads/{retry}", "sha": base_sha},
        )
        if retry_response.status_code == 201:
            return retry
        raise SolverError(f"Failed to create branch: {retry_response.status_code} {retry_response.text}")

    raise SolverError(f"Failed to create branch: {response.status_code} {response.text}")


async def create_or_update_file(
    repo_name: str,
    branch_name: str,
    file_path: str,
    content: str,
    message: str,
    token: str,
) -> str:
    existing_sha = None
    existing = await _github_request(
        "GET", f"https://api.github.com/repos/{repo_name}/contents/{file_path}?ref={branch_name}", token
    )
    if existing.status_code == 200:
        existing_sha = existing.json().get("sha")
    elif existing.status_code not in (404,):
        raise SolverError(f"Failed to read file sha: {existing.status_code} {existing.text}")

    encoded_content = base64.b64encode(content.encode("utf-8")).decode("utf-8")
    payload: dict[str, Any] = {
        "message": message,
        "content": encoded_content,
        "branch": branch_name,
    }
    if existing_sha:
        payload["sha"] = existing_sha

    response = await _github_request(
        "PUT", f"https://api.github.com/repos/{repo_name}/contents/{file_path}", token, json=payload
    )
    if response.status_code not in (200, 201):
        raise SolverError(f"Failed to commit file {file_path}: {response.status_code} {response.text}")
    return response.json()["commit"]["sha"]


async def create_pull_request(
    repo_name: str, title: str, head: str, base: str, body: str, token: str
) -> dict[str, Any]:
    response = await _github_request(
        "POST",
        f"https://api.github.com/repos/{repo_name}/pulls",
        token,
        json={"title": title, "head": head, "base": base, "body": body},
    )
    if response.status_code != 201:
        raise SolverError(f"Failed to create PR: {response.status_code} {response.text}")
    return response.json()


async def _build_context(
    repo_name: str,
    token: str,
    target_files: list[str],
) -> tuple[list[str], dict[str, str]]:
    focus_files = target_files[:MAX_CONTEXT_FILES]

    async def _load_snippet(path: str):
        try:
            text = await get_file_content(repo_name, path, token)
            return path, text[:1800]
        except Exception:
            return path, None

    snippet_results = await asyncio.gather(*[_load_snippet(path) for path in focus_files])
    snippets: dict[str, str] = {path: snippet for path, snippet in snippet_results if snippet}

    return focus_files, snippets


def _tokenize(text: str) -> set[str]:
    return {token for token in re.findall(r"[a-zA-Z][a-zA-Z0-9_]{2,}", (text or "").lower())}


def _infer_target_files_from_issue(issue_title: str, issue_body: str, candidates: list[str]) -> list[str]:
    tokens = _tokenize(issue_title) | _tokenize(issue_body)
    if not tokens:
        return candidates[:MAX_CHANGED_FILES]

    scored: list[tuple[int, str]] = []
    for candidate in candidates:
        low = candidate.lower()
        parts = re.split(r"[/.\-_]", low)
        score = 0
        for token in tokens:
            if token in parts:
                score += 3
            elif token in low:
                score += 1
        if low.startswith("src/") or low.startswith("backend/"):
            score += 1
        if score > 0:
            scored.append((score, candidate))

    if not scored:
        return candidates[:MAX_CHANGED_FILES]

    scored.sort(key=lambda item: (-item[0], item[1]))
    return [path for _score, path in scored[:MAX_CHANGED_FILES]]


def _iter_change_items(changes: Any) -> list[tuple[str, str]]:
    if isinstance(changes, dict):
        return [(path, content) for path, content in changes.items()]

    if not isinstance(changes, list):
        return []

    items: list[tuple[str, str]] = []
    for item in changes:
        if not isinstance(item, dict):
            continue
        path = item.get("path")
        content = item.get("content")
        if isinstance(path, str) and isinstance(content, str):
            items.append((path, content))
    return items


def _resolve_generated_path(path: str, allowed_files: set[str]) -> str | None:
    normalized = _normalize_user_path(path)
    if not normalized:
        return None
    if normalized in allowed_files:
        return normalized

    low = normalized.lower()
    suffix_matches = [p for p in allowed_files if p.lower().endswith(low)]
    if len(suffix_matches) == 1:
        return suffix_matches[0]

    basename = normalized.split("/")[-1].lower()
    basename_matches = [p for p in allowed_files if p.split("/")[-1].lower() == basename]
    if len(basename_matches) == 1:
        return basename_matches[0]

    return None


def _allows_large_rewrite(instruction: str) -> bool:
    text = (instruction or "").lower()
    markers = (
        "rewrite file",
        "replace entire file",
        "full rewrite",
        "refactor whole",
        "from scratch",
        "rebuild file",
    )
    return any(marker in text for marker in markers)


def _is_overly_broad_change(original_content: str, new_content: str, instruction: str) -> bool:
    if not original_content.strip() or _allows_large_rewrite(instruction):
        return False

    ratio = difflib.SequenceMatcher(a=original_content, b=new_content).ratio()
    # Guardrail: block near-total rewrites unless explicitly requested.
    return ratio < 0.35


def _sanitize_changes(
    raw: dict[str, Any],
    allowed_files: set[str],
    original_contents: dict[str, str],
    instruction_map: dict[str, str],
    *,
    allow_single_file_rewrite: bool = False,
) -> tuple[list[tuple[str, str]], str, str, list[str]]:
    commit_message = (raw.get("commit_message") or "Fix issue via AI agent").strip()
    solution = (raw.get("solution") or "Implemented targeted fix.").strip()

    selected: list[tuple[str, str]] = []
    rejections: list[str] = []

    for path, content in _iter_change_items(raw.get("code_changes")):
        normalized = _resolve_generated_path(path, allowed_files)
        if not normalized:
            continue
        if normalized not in allowed_files:
            continue
        if not isinstance(content, str) or not content.strip():
            continue
        is_broad = _is_overly_broad_change(
            original_contents.get(normalized, ""),
            content,
            instruction_map.get(normalized, ""),
        )
        if is_broad:
            # If exactly one target file is allowed, permit broader changes on retry.
            if not (allow_single_file_rewrite and len(allowed_files) == 1):
                rejections.append(f"Rejected broad rewrite for '{normalized}'")
                continue
        selected.append((normalized, content))
        if len(selected) >= MAX_CHANGED_FILES:
            break

    return selected, commit_message, solution, rejections


async def solve_issue(issue_number, issue_title, repo_name, github_token=None):
    if not github_token:
        raise SolverError("GitHub token is required for real issue solving.")

    repo_info = await get_repo_info(repo_name, github_token)
    permissions = repo_info.get("permissions") or {}
    if permissions and not permissions.get("push", False):
        raise SolverError("GitHub token does not have push access to this repository.")

    issue = await get_issue_details(repo_name, issue_number, github_token)
    issue_body = issue.get("body") or ""

    default_branch = repo_info.get("default_branch", "main")
    base_sha = await get_branch_sha(repo_name, default_branch, github_token)

    candidates = await get_repo_candidate_files(repo_name, base_sha, github_token)
    if not candidates:
        raise SolverError("No editable repository files were found. The connected repository may contain only blocked or unsupported file types.")

    file_instructions, parse_problems = _extract_issue_file_instructions(issue_body, candidates)
    parser_mode = "explicit"
    if not file_instructions:
        inferred_paths = _infer_target_files_from_issue(issue_title, issue_body, candidates)
        if not inferred_paths:
            raise SolverError(_format_issue_pattern_error(parse_problems))
        parser_mode = "inferred"
        fallback_changes = (issue_body or issue_title or "Fix the reported issue.").strip()
        file_instructions = [{"path": path, "changes": fallback_changes} for path in inferred_paths]

    target_files = [item["path"] for item in file_instructions]
    instruction_map = {item["path"]: item["changes"] for item in file_instructions}

    original_contents_results = await asyncio.gather(
        *[get_file_content(repo_name, path, github_token) for path in target_files]
    )
    original_contents: dict[str, str] = {
        path: content for path, content in zip(target_files, original_contents_results)
    }

    focus_files, snippets = await _build_context(repo_name, github_token, target_files)

    prompt = f"""
You are an AI software engineer fixing a GitHub issue.

Repository: {repo_name}
Issue #{issue_number}: {issue_title}
Issue Body:
{issue_body}

STRICT RULES:
1. Modify ONLY the files listed in Allowed target files.
2. Allowed target files:
{json.dumps(target_files, indent=2)}
3. Parsed file-specific change instructions:
{json.dumps(file_instructions, indent=2)}
4. Do not create new files.
5. Do not modify any other repository files.
6. Follow the Changes text for each file exactly.
7. Return ONLY valid JSON.
8. Instruction mode is '{parser_mode}'. If mode is inferred, infer minimal edits from issue text without broad rewrites.

Helpful context from likely relevant files:
Focus Files: {json.dumps(focus_files)}
Snippets:
{json.dumps(snippets)}

Return this JSON exactly:
{{
  "solution": "short summary",
  "commit_message": "fix(issue): short message",
  "code_changes": [
    {{ "path": "backend/example.py", "content": "FULL NEW FILE CONTENT" }}
  ]
}}
"""

    client = ollama.AsyncClient()
    selected_changes: list[tuple[str, str]] = []
    commit_message = "Fix issue via AI agent"
    solution = "Implemented targeted fix."
    rejected_changes: list[str] = []

    attempt_prompt = prompt
    for _attempt in range(1, 4):
        model_response = await client.chat(model=MODEL, messages=[{"role": "user", "content": attempt_prompt}])
        parsed = _extract_json_object(model_response.message.content if hasattr(model_response, "message") else "")
        selected_changes, commit_message, solution, rejected_changes = _sanitize_changes(
            parsed,
            set(target_files),
            original_contents,
            instruction_map,
        )
        if selected_changes:
            break

        attempt_prompt = f"""
Previous output was invalid because no acceptable code_changes were found.

Allowed target files only:
{json.dumps(target_files, indent=2)}

Return valid JSON only with this shape and at least 1 change item:
{{
  "solution": "short summary",
  "commit_message": "fix(issue): short message",
  "code_changes": [
    {{ "path": "{target_files[0]}", "content": "FULL NEW FILE CONTENT" }}
  ]
}}

Do not include markdown explanation. Do not include unrelated files.
"""

    if not selected_changes and rejected_changes:
        retry_prompt = f"""
You previously proposed broad file rewrites. Retry with MINIMAL edits only.

Repository: {repo_name}
Issue #{issue_number}: {issue_title}

Allowed files (do not touch anything else):
{json.dumps(target_files, indent=2)}

Instructions per file:
{json.dumps(file_instructions, indent=2)}

Current file contents:
{json.dumps(original_contents)}

Rules:
1. Keep most of each file unchanged.
2. Edit only required sections.
3. Return only valid JSON in the exact shape below.

{{
  "solution": "short summary",
  "commit_message": "fix(issue): short message",
  "code_changes": [
    {{ "path": "{target_files[0]}", "content": "FULL NEW FILE CONTENT" }}
  ]
}}
"""
        retry_response = await client.chat(model=MODEL, messages=[{"role": "user", "content": retry_prompt}])
        retry_parsed = _extract_json_object(retry_response.message.content if hasattr(retry_response, "message") else "")
        selected_changes, commit_message, solution, rejected_changes = _sanitize_changes(
            retry_parsed,
            set(target_files),
            original_contents,
            instruction_map,
            allow_single_file_rewrite=True,
        )

    if not selected_changes:
        extra = f" ({'; '.join(rejected_changes)})" if rejected_changes else ""
        raise SolverError(
            "AI did not propose valid targeted file updates. No unrelated changes were applied."
            + extra
        )

    branch_name = await create_branch(
        repo_name, f"agent/issue-{issue_number}", base_sha, github_token
    )

    files_changed: list[str] = []
    for path, content in selected_changes:
        await create_or_update_file(
            repo_name,
            branch_name,
            path,
            content,
            commit_message or f"fix(issue-{issue_number}): targeted update",
            github_token,
        )
        files_changed.append(path)

    if not files_changed:
        raise SolverError("No files were committed; PR was not created.")

    pr_title = f"fix(issue #{issue_number}): {issue_title[:80]}"
    pr_body = (
        f"## Issue #{issue_number}\n\n"
        f"{issue_body}\n\n"
        f"## Solution Summary\n\n{solution}\n\n"
        f"## Files Changed\n\n" + "\n".join(f"- {p}" for p in files_changed)
    )

    pr = await create_pull_request(
        repo_name, pr_title, branch_name, default_branch, pr_body, github_token
    )

    return {
        "branch_name": branch_name,
        "pr_number": pr["number"],
        "pr_url": pr["html_url"],
        "solution_summary": solution,
        "files_changed": files_changed,
    }
