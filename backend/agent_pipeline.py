"""
gitAgent — Google ADK agent pipeline
=====================================

Architecture (SequentialAgent with 3 sub-agents):
  1. CoderAgent   — fetches issue, creates branch, applies fix, opens PR
  2. ReviewerAgent — reviews diff, produces summary + risk level
  3. GatekeeperAgent — waits for human approval via DB flag, then merges

The pipeline runs in a background asyncio task so it never blocks the API.
Progress is streamed to the frontend via WebSockets (ws_manager).
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import aiosqlite
from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.tools.mcp_tool import McpToolset, StdioServerParameters
from google.adk.runners import Runner

from database import DATABASE_URL
from ws_manager import manager as ws

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────

async def _log(run_id: str, user_id: str, phase: str, level: str, message: str):
    """Persist a log entry and broadcast it over WebSocket."""
    async with aiosqlite.connect(DATABASE_URL) as db:
        await db.execute(
            "INSERT INTO run_logs (run_id, phase, level, message) VALUES (?,?,?,?)",
            (run_id, phase, level, message),
        )
        await db.commit()
    await ws.broadcast_log(user_id, run_id, phase, level, message)
    logger.info("[%s] [%s] %s", phase, level, message)


async def _set_status(run_id: str, user_id: str, status: str, **fields):
    """Update agent_runs.status (and optional extra fields) then broadcast."""
    set_clause = "status = ?, updated_at = CURRENT_TIMESTAMP"
    params: list = [status]
    for k, v in fields.items():
        set_clause += f", {k} = ?"
        params.append(v)
    params.append(run_id)
    async with aiosqlite.connect(DATABASE_URL) as db:
        await db.execute(f"UPDATE agent_runs SET {set_clause} WHERE id = ?", params)
        await db.commit()
    await ws.broadcast_status(user_id, run_id, status, **fields)


async def _push_inbox(user_id: str, run_id: str, msg_type: str, title: str, body: str):
    msg_id = str(uuid.uuid4())
    async with aiosqlite.connect(DATABASE_URL) as db:
        await db.execute(
            "INSERT INTO inbox_messages (id, user_id, run_id, type, title, body) VALUES (?,?,?,?,?,?)",
            (msg_id, user_id, run_id, msg_type, title, body),
        )
        await db.commit()
    await ws.broadcast_inbox(user_id, {
        "id": msg_id, "run_id": run_id, "type": msg_type,
        "title": title, "body": body, "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


# ─────────────────────────────────────────────────────────────────────
# Agent factory  — creates a fresh toolset per run (each run has its own token)
# ─────────────────────────────────────────────────────────────────────

def _build_github_toolset(github_token: str) -> McpToolset:
    return McpToolset(
        server_parameters=StdioServerParameters(
            command="npx",
            args=["-y", "@modelcontextprotocol/server-github"],
            env={"GITHUB_PERSONAL_ACCESS_TOKEN": github_token},
        )
    )


def _build_pipeline(github_token: str, repo_full_name: str, issue_number: int) -> SequentialAgent:
    github_mcp = _build_github_toolset(github_token)

    # ── Agent 1: Coder ────────────────────────────────────────────────
    coder_agent = LlmAgent(
        name="CoderAgent",
        model=os.getenv("ADK_MODEL", "gemini-2.0-flash"),
        instruction=f"""
You are an expert software engineer.

Your task:
1. Fetch issue #{issue_number} from the repository '{repo_full_name}' using get_issue.
2. Understand the problem described in the issue.
3. Create a new branch named exactly 'fix/issue-{issue_number}' from the default branch using create_branch.
4. Read the relevant source files using get_file_contents.
5. Apply the minimal, correct fix to resolve the issue using create_or_update_file or push_files.
6. Open a Pull Request from 'fix/issue-{issue_number}' → default branch titled:
   "fix(#{issue_number}): <short description>"
   — body must include:
     * What was broken
     * What you changed and why
     * How to test it
7. Return a JSON object with keys:
   branch_name, pr_number, pr_url, files_changed (list), commit_messages (list)
""",
        tools=[github_mcp],
        output_key="coding_results",
    )

    # ── Agent 2: Reviewer ─────────────────────────────────────────────
    reviewer_agent = LlmAgent(
        name="ReviewerAgent",
        model=os.getenv("ADK_MODEL", "gemini-2.0-flash"),
        instruction=f"""
You are a senior code reviewer.

Review the pull request described in {{coding_results}} for repository '{repo_full_name}'.
Use get_pull_request and list_pull_request_files to inspect the diff.

Produce a JSON object with:
  risk_level: "Low" | "Medium" | "High"
  summary: 2-4 sentence plain-English explanation of:
    - Root cause of the bug/issue
    - What was changed
    - Why this fix is correct
    - Any edge-cases or concerns
  test_coverage: brief note on test coverage
  breaking_changes: true/false
""",
        tools=[github_mcp],
        output_key="review_results",
    )

    # ── Agent 3: Gatekeeper ───────────────────────────────────────────
    # Does NOT call merge automatically — it prepares for human approval.
    # The /api/agent/{run_id}/merge endpoint handles the actual merge
    # after the user clicks "Approve" in the UI.
    gatekeeper_agent = LlmAgent(
        name="GatekeeperAgent",
        model=os.getenv("ADK_MODEL", "gemini-2.0-flash"),
        instruction=f"""
You are a release gatekeeper for repository '{repo_full_name}'.

Based on {{coding_results}} and {{review_results}}:
1. Write a concise merge request message for the human reviewer.
2. List the exact merge steps that will be taken if approved:
   - Squash and merge PR into default branch
   - Delete the feature branch
   - Close the linked issue
3. Return a JSON object with:
   merge_message: string
   steps: list of strings
   pr_number: integer (from coding_results)
   pr_url: string (from coding_results)
""",
        tools=[],  # no tools needed — just synthesises
        output_key="gatekeeper_results",
    )

    return SequentialAgent(
        name="GitAgentWorkflow",
        sub_agents=[coder_agent, reviewer_agent, gatekeeper_agent],
    )


# ─────────────────────────────────────────────────────────────────────
# Main entry — runs in a background task
# ─────────────────────────────────────────────────────────────────────

async def run_agent_pipeline(
    run_id: str,
    user_id: str,
    repo_full_name: str,
    github_token: str,
    issue_number: int,
    issue_title: str,
):
    """
    Full pipeline:  queue → coding → review → awaiting_approval
    Called via asyncio.create_task() from the /api/agent/run endpoint.
    """
    try:
        # ── Phase 0: setup ────────────────────────────────────────────
        await _set_status(run_id, user_id, "running")
        await _log(run_id, user_id, "setup", "info",
                   f"Starting agent pipeline for issue #{issue_number}: {issue_title}")

        # ── Phase 1: Coding ───────────────────────────────────────────
        await _log(run_id, user_id, "coding", "info",
                   f"Fetching issue #{issue_number} from {repo_full_name} …")

        pipeline = _build_pipeline(github_token, repo_full_name, issue_number)
        runner   = Runner(agent=pipeline)

        coding_complete = asyncio.Event()
        review_complete = asyncio.Event()

        # Intercept per-agent completion via runner events (ADK 1.x streaming)
        coding_results   = {}
        review_results   = {}
        gatekeeper_results = {}

        # We run the full pipeline and parse structured output at the end.
        # ADK streams events; we collect them and log key milestones.
        full_output: dict = {}

        await _log(run_id, user_id, "coding", "info", "Creating fix branch …")

        # Run the pipeline (this is the blocking ADK call — wrapped in executor)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: asyncio.run(_run_adk(runner, issue_number, repo_full_name))
        )

        # ── Parse ADK output ──────────────────────────────────────────
        coding_results     = result.get("coding_results", {})
        review_results     = result.get("review_results", {})
        gatekeeper_results = result.get("gatekeeper_results", {})

        branch_name = coding_results.get("branch_name", f"fix/issue-{issue_number}")
        pr_number   = coding_results.get("pr_number")
        pr_url      = coding_results.get("pr_url", "")
        risk_level  = review_results.get("risk_level", "Unknown")
        summary     = review_results.get("summary", "")

        await _log(run_id, user_id, "coding", "success",
                   f"Branch created: {branch_name}")
        for msg in coding_results.get("commit_messages", []):
            await _log(run_id, user_id, "coding", "success", f"Committed: {msg}")
        await _log(run_id, user_id, "coding", "success",
                   f"PR #{pr_number} opened: {pr_url}")

        # ── Phase 2: Review ───────────────────────────────────────────
        await _log(run_id, user_id, "review", "info", "ReviewerAgent analysing diff …")
        await _log(run_id, user_id, "review", "info",
                   f"Risk level assessed: {risk_level}")
        await _log(run_id, user_id, "review", "success",
                   "Code review complete. Preparing merge request for human approval.")

        # ── Phase 3: Persist review + move to awaiting_approval ───────
        await _set_status(
            run_id, user_id, "awaiting_approval",
            branch_name=branch_name,
            pr_number=pr_number,
            pr_url=pr_url,
            risk_level=risk_level,
            review_summary=summary,
        )

        # ── Inbox notification ────────────────────────────────────────
        merge_msg = gatekeeper_results.get("merge_message",
            f"PR #{pr_number} for issue #{issue_number} is ready to merge into main.")
        await _push_inbox(
            user_id, run_id,
            msg_type="merge_request",
            title=f"PR #{pr_number} ready to merge — {issue_title}",
            body=merge_msg,
        )
        await ws.broadcast_merge_request(user_id, run_id, pr_number, pr_url, summary)

        await _log(run_id, user_id, "gatekeeper", "complete",
                   "✓ Awaiting human approval to merge into main.")

    except Exception as exc:
        logger.exception("Agent pipeline failed for run %s", run_id)
        await _set_status(run_id, user_id, "failed")
        await _log(run_id, user_id, "pipeline", "error", f"Pipeline error: {exc}")


async def _run_adk(runner: Runner, issue_number: int, repo: str) -> dict:
    """Thin async wrapper around the synchronous ADK Runner."""
    prompt = (
        f"Fix issue #{issue_number} in the repository '{repo}'. "
        "Follow your instructions exactly and return structured JSON output."
    )
    # ADK 1.x async API
    result_state = {}
    async for event in runner.run_async(prompt):
        # Collect output_key values from sub-agent final events
        if hasattr(event, "output_key") and event.output_key:
            result_state[event.output_key] = event.content
    return result_state


# ─────────────────────────────────────────────────────────────────────
# Merge executor  — called from the /merge endpoint after human approval
# ─────────────────────────────────────────────────────────────────────

async def execute_merge(
    run_id: str,
    user_id: str,
    repo_full_name: str,
    github_token: str,
    pr_number: int,
    branch_name: str,
):
    """Merges the PR via GitHub MCP and closes the issue."""
    try:
        await _log(run_id, user_id, "merge", "info",
                   f"Human approved. Merging PR #{pr_number} into main …")

        github_mcp = _build_github_toolset(github_token)

        merge_agent = LlmAgent(
            name="MergeAgent",
            model=os.getenv("ADK_MODEL", "gemini-2.0-flash"),
            instruction=f"""
Merge pull request #{pr_number} in repository '{repo_full_name}':
1. Use merge_pull_request with merge_method='squash'.
2. Delete branch '{branch_name}' using delete_branch.
3. Return JSON with: merged (bool), sha (string), message (string).
""",
            tools=[github_mcp],
            output_key="merge_result",
        )

        runner = Runner(agent=merge_agent)
        loop   = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: asyncio.run(_run_adk(runner, pr_number, repo_full_name)),
        )

        merge_info = result.get("merge_result", {})
        if merge_info.get("merged"):
            await _set_status(run_id, user_id, "merged",
                              merge_approved=True)
            await _log(run_id, user_id, "merge", "success",
                       f"✓ Merged! SHA: {merge_info.get('sha', 'n/a')}. Branch deleted.")
            await _push_inbox(
                user_id, run_id,
                msg_type="info",
                title=f"PR #{pr_number} merged successfully",
                body=f"Changes are now live on main. Branch '{branch_name}' deleted.",
            )
        else:
            raise RuntimeError(f"Merge not confirmed: {merge_info}")

    except Exception as exc:
        logger.exception("Merge failed for run %s", run_id)
        await _set_status(run_id, user_id, "failed")
        await _log(run_id, user_id, "merge", "error", f"Merge error: {exc}")
