import { useEffect, useRef, useState } from "react";
import AuthPage from "./components/auth/AuthPage";
import RepoSetup from "./components/auth/RepoSetup";
import Sidebar from "./components/layout/Sidebar";
import CommitsPage from "./components/pages/CommitsPage";
import Dashboard from "./components/pages/Dashboard";
import InboxPage from "./components/pages/InboxPage";
import IssuesPage from "./components/pages/IssuesPage";
import ProfilePage from "./components/pages/ProfilePage";
import ResolverPage from "./components/pages/ResolverPage";
import ReviewPage from "./components/pages/ReviewPage";
import { createRepoWorkspace } from "./data/mockData";

const SESSION_STORAGE_KEY = "gitagent.session";
const RAW_API_BASE_URL = (import.meta.env.VITE_API_URL || "").trim();
const API_BASE_URL = (
  RAW_API_BASE_URL ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:8000")
).replace(/\/$/, "");
const WS_BASE_URL = (import.meta.env.VITE_WS_URL || API_BASE_URL)
  .replace(/^http:/i, "ws:")
  .replace(/^https:/i, "wss:")
  .replace(/\/$/, "");

function normalizeRepoId(repoUrl) {
  return repoUrl.trim().toLowerCase();
}

function formatRelative(isoValue) {
  if (!isoValue) {
    return "just now";
  }

  const parsedDate = new Date(isoValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return "just now";
  }

  const minutes = Math.max(1, Math.floor((Date.now() - parsedDate.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function mapRunStatus(runStatus, issueState) {
  if (runStatus === "running" || runStatus === "queued") return "solving";
  if (runStatus === "awaiting_approval" || runStatus === "review") return "review";
  if (runStatus === "merged") return "merged";
  if (issueState === "closed") return "closed";
  return "open";
}

async function parseApiError(response) {
  let message = `Request failed with ${response.status}`;

  try {
    const data = await response.json();
    if (data?.detail) {
      message = Array.isArray(data.detail) ? data.detail.map((item) => item.msg || item).join(", ") : data.detail;
    }
  } catch {
    // Keep fallback message.
  }

  return new Error(message);
}

function loadStoredSession() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const connectedRepos = Array.isArray(parsed.connectedRepos) ? parsed.connectedRepos : [];
    const activeRepoId = connectedRepos.some((repo) => repo.id === parsed.activeRepoId)
      ? parsed.activeRepoId
      : connectedRepos[0]?.id || null;
    const hasToken = typeof parsed.authToken === "string" && parsed.authToken.trim().length > 0;
    const hasUser = Boolean(parsed.user);

    // Never restore an authenticated session without a token.
    if (!hasUser || !hasToken) {
      return null;
    }

    const hasRepos = connectedRepos.length > 0;
    const authStep = hasUser ? (hasRepos ? parsed.authStep || "app" : "repo") : "auth";

    return {
      authStep: hasUser ? (hasRepos && authStep === "auth" ? "app" : authStep) : "auth",
      user: parsed.user || null,
      authToken: parsed.authToken || null,
      connectedRepos,
      activeRepoId,
    };
  } catch {
    return null;
  }
}

export default function App() {
  const storedSession = loadStoredSession();
  const navItems = [
    { id: "dashboard", label: "Dashboard" },
    { id: "issues", label: "Issues" },
    { id: "commits", label: "Commits" },
    { id: "review", label: "Review" },
    { id: "resolver", label: "Resolver" },
    { id: "inbox", label: "Inbox" },
    { id: "profile", label: "Profile" },
  ];
  const [authStep, setAuthStep] = useState(storedSession?.authStep || "auth");
  const [user, setUser] = useState(storedSession?.user || null);
  const [authToken, setAuthToken] = useState(storedSession?.authToken || null);
  const [connectedRepos, setConnectedRepos] = useState(storedSession?.connectedRepos || []);
  const [activeRepoId, setActiveRepoId] = useState(storedSession?.activeRepoId || null);
  const reposRef = useRef(connectedRepos);
  const activeRepoIdRef = useRef(activeRepoId);
  const syncInFlightRef = useRef(false);
  const wsSocketRef = useRef(null);
  const wsReconnectTimerRef = useRef(null);
  const wsPingTimerRef = useRef(null);
  const wsSyncTimerRef = useRef(null);
  const [globalPendingCount, setGlobalPendingCount] = useState(0);
  const isGlobalLoading = globalPendingCount > 0;

  const activeRepo = connectedRepos.find((repo) => repo.id === activeRepoId) || null;
  const page = activeRepo?.currentPage || "dashboard";
  const issues = activeRepo?.issues || [];
  const commits = activeRepo?.commits || [];
  const inbox = activeRepo?.inbox || [];
  const selectedIssue = issues.find((issue) => issue.id === activeRepo?.selectedIssueId) || issues[0] || null;
  const activeUser = user
    ? {
      ...user,
      repo: activeRepo?.repo,
      token: activeRepo?.token,
      repos: connectedRepos,
      repoConfig: activeRepo?.config,
      repoStats: {
        issueCount: issues.length,
        commitCount: commits.length,
        unreadInboxCount: inbox.filter((message) => !message.read).length,
      },
    }
    : null;
  const profileUser = user
    ? {
      ...user,
      repos: connectedRepos,
    }
    : null;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const session = { authStep, user, authToken, connectedRepos, activeRepoId };
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }, [authStep, user, authToken, connectedRepos, activeRepoId]);

  useEffect(() => {
    reposRef.current = connectedRepos;
  }, [connectedRepos]);

  useEffect(() => {
    activeRepoIdRef.current = activeRepoId;
  }, [activeRepoId]);

  const apiRequest = async (path, options = {}) => {
    const { method = "GET", body, token = authToken } = options;
    const headers = { ...(options.headers || {}) };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const isAuthEndpoint = path.startsWith("/api/auth/");
    if (response.status === 401 && !isAuthEndpoint) {
      setAuthStep("auth");
      setAuthToken(null);
      setUser(null);
      setConnectedRepos([]);
      setActiveRepoId(null);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
      throw new Error("Session expired. Please sign in again.");
    }

    if (!response.ok) {
      throw await parseApiError(response);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  };

  const loadRepoWorkspaceFromApi = async (repoUrl, repoToken, repoId, existingRepo = null) => {
    const [issuesResult, runsResult, inboxResult] = await Promise.allSettled([
      apiRequest("/api/issues?state=all"),
      apiRequest("/api/agent/runs"),
      apiRequest("/api/agent/inbox"),
    ]);

    const apiIssues = issuesResult.status === "fulfilled" ? issuesResult.value : [];
    const apiRuns = runsResult.status === "fulfilled" ? runsResult.value : [];
    const apiInbox = inboxResult.status === "fulfilled" ? inboxResult.value : [];

    const runByIssue = new Map();
    apiRuns.forEach((run) => {
      if (!runByIssue.has(run.issue_number)) {
        runByIssue.set(run.issue_number, run);
      }
    });
    const runById = new Map(apiRuns.map((run) => [run.id, run]));
    const previousSelected = existingRepo?.selectedIssueId;

    const issues = apiIssues.map((issue) => {
      const run = runByIssue.get(issue.number);
      const mappedState = mapRunStatus(run?.status, issue.state);

      return {
        id: issue.number,
        number: issue.number,
        title: issue.title,
        body: issue.body || "",
        state: mappedState,
        labels: issue.labels || [],
        assignee: run ? "ai-agent" : null,
        runId: run?.id || null,
        branch: run?.branch_name || null,
        progress: mappedState === "merged" || mappedState === "review" ? 100 : mappedState === "solving" ? 55 : 0,
        pr: run?.pr_number ? `#${run.pr_number}` : null,
      };
    });

    const commits = apiRuns.map((run) => ({
      id: run.id,
      hash: run.id.slice(0, 7),
      msg: run.review_summary || run.issue_title || `Issue #${run.issue_number}`,
      branch: run.branch_name || "n/a",
      time: formatRelative(run.updated_at || run.created_at),
      author: "gitAgent[bot]",
      issue: run.issue_number,
    }));

    const inbox = apiInbox.map((message) => ({
      id: message.id,
      type: message.type || "info",
      title: message.title,
      body: message.body || "",
      time: formatRelative(message.created_at),
      read: Boolean(message.read),
      issue: message.run_id ? runById.get(message.run_id)?.issue_number : undefined,
      runId: message.run_id,
      pr: undefined,
    }));

    const latestFailedRun = apiRuns.find((run) => run.status === "failed");

    const activeIssues = issues.filter((issue) => issue.state !== "review" && issue.state !== "merged" && issue.state !== "closed");
    const fallbackSelectedIssueId = activeIssues[0]?.id || issues[0]?.id || null;

    return {
      ...(existingRepo || createRepoWorkspace(repoUrl, repoId)),
      id: repoId,
      repo: repoUrl,
      token: repoToken,
      issues,
      runs: apiRuns,
      commits,
      inbox,
      lastRunError: latestFailedRun?.review_summary || null,
      currentPage: existingRepo?.currentPage || "dashboard",
      selectedIssueId: previousSelected || fallbackSelectedIssueId,
    };
  };

  const syncActiveRepoFromRefs = async () => {
    if (syncInFlightRef.current) {
      return;
    }

    const current = reposRef.current.find((repo) => repo.id === activeRepoIdRef.current);
    if (!current) {
      return;
    }

    syncInFlightRef.current = true;
    try {
      const updatedRepo = await loadRepoWorkspaceFromApi(current.repo, current.token, current.id, current);
      setConnectedRepos((prev) => prev.map((repo) => (repo.id === current.id ? updatedRepo : repo)));
    } finally {
      syncInFlightRef.current = false;
    }
  };

  const refreshActiveRepoData = async () => {
    await syncActiveRepoFromRefs();
  };

  const runWithGlobalLoading = async (work) => {
    setGlobalPendingCount((prev) => prev + 1);
    try {
      return await work();
    } finally {
      setGlobalPendingCount((prev) => Math.max(0, prev - 1));
    }
  };

  useEffect(() => {
    if (authStep !== "app" || !authToken) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      syncActiveRepoFromRefs().catch(() => {
        // Ignore transient polling failures.
      });
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [authStep, authToken, activeRepoId]);

  useEffect(() => {
    if (authStep !== "app" || !authToken) {
      return;
    }

    if (!user?.id) {
      return;
    }

    let cancelled = false;

    const clearTimers = () => {
      if (wsReconnectTimerRef.current) {
        window.clearTimeout(wsReconnectTimerRef.current);
        wsReconnectTimerRef.current = null;
      }
      if (wsPingTimerRef.current) {
        window.clearInterval(wsPingTimerRef.current);
        wsPingTimerRef.current = null;
      }
      if (wsSyncTimerRef.current) {
        window.clearTimeout(wsSyncTimerRef.current);
        wsSyncTimerRef.current = null;
      }
    };

    const scheduleSync = () => {
      if (wsSyncTimerRef.current) {
        return;
      }
      wsSyncTimerRef.current = window.setTimeout(async () => {
        wsSyncTimerRef.current = null;
        if (cancelled) {
          return;
        }
        try {
          await syncActiveRepoFromRefs();
        } catch {
          // Ignore transient refresh failures on push events.
        }
      }, 300);
    };

    const connect = () => {
      // Decommission any existing socket before opening a new one.
      if (wsSocketRef.current) {
        const old = wsSocketRef.current;
        wsSocketRef.current = null;
        old.onmessage = null;
        old.onerror = null;
        old.onclose = null;
        if (old.readyState === WebSocket.CONNECTING) {
          // Never close while CONNECTING — it triggers a browser console error.
          // Null onopen so the connection is closed as soon as the handshake finishes.
          old.onopen = () => old.close();
        } else {
          old.onopen = null;
          if (old.readyState === WebSocket.OPEN) {
            old.close();
          }
        }
      }

      const socketUrl = `${WS_BASE_URL}/api/agent/ws/${user.id}?token=${encodeURIComponent(authToken)}`;
      const socket = new WebSocket(socketUrl);
      wsSocketRef.current = socket;

      socket.onopen = () => {
        clearTimers();
        wsPingTimerRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send("ping");
          }
        }, 25000);
        scheduleSync();
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const watchEvents = new Set(["log", "status_change", "inbox_new", "merge_request"]);
          if (watchEvents.has(payload?.event)) {
            scheduleSync();
          }
        } catch {
          // Ignore malformed events.
        }
      };

      socket.onerror = () => {
        // Let onclose handle reconnection; avoid closing a still-connecting socket.
      };

      socket.onclose = (event) => {
        // Ignore events from sockets that have been superseded by a newer connection.
        if (cancelled || wsSocketRef.current !== socket) {
          return;
        }
        clearTimers();
        if (event?.code === 1008 || event?.code === 4001) {
          // Token is invalid/expired or user mismatch: force re-auth and stop reconnect loop.
          setAuthStep("auth");
          setAuthToken(null);
          setUser(null);
          setConnectedRepos([]);
          setActiveRepoId(null);
          return;
        }
        wsReconnectTimerRef.current = window.setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearTimers();
      if (wsSocketRef.current) {
        const s = wsSocketRef.current;
        wsSocketRef.current = null;
        s.onmessage = null;
        s.onerror = null;
        s.onclose = null;
        if (s.readyState === WebSocket.CONNECTING) {
          // Defer close until handshake finishes to avoid browser warning.
          s.onopen = () => s.close();
        } else {
          s.onopen = null;
          s.close();
        }
      }
    };
  }, [authStep, authToken, user?.id]);

  const handleAuth = async (authData) => {
    if (!authData?.access_token || !authData?.user) {
      throw new Error("Authentication did not return a valid session.");
    }

    setAuthToken(authData.access_token);
    setUser(authData.user);
    setConnectedRepos([]);
    setActiveRepoId(null);
    setAuthStep("repo");
  };

  const handleRepoSetup = async (cfg) => {
    await runWithGlobalLoading(async () => {
      const normalizedRepo = cfg.repo.trim();
      const normalizedToken = cfg.token.trim();
      const repoId = normalizeRepoId(normalizedRepo);
      const existingRepo = connectedRepos.find((repo) => repo.id === repoId) || null;

      await apiRequest("/api/repos/connect", {
        method: "POST",
        body: { repo_url: normalizedRepo, github_token: normalizedToken },
      });

      const nextRepo = await loadRepoWorkspaceFromApi(normalizedRepo, normalizedToken, repoId, existingRepo);

      setConnectedRepos((prev) => {
        const existingIndex = prev.findIndex((repo) => repo.id === repoId);

        if (existingIndex >= 0) {
          return prev.map((repo) => (repo.id === repoId ? nextRepo : repo));
        }

        return [...prev, nextRepo];
      });

      setActiveRepoId(repoId);
      setAuthStep("app");
    });
  };

  const handleAddRepo = () => {
    setAuthStep("repo");
  };

  const handleSwitchRepo = async (repoId) => {
    await runWithGlobalLoading(async () => {
      const targetRepo = connectedRepos.find((repo) => repo.id === repoId);
      if (!targetRepo) {
        return;
      }

      await apiRequest("/api/repos/connect", {
        method: "POST",
        body: { repo_url: targetRepo.repo },
      });

      const refreshedRepo = await loadRepoWorkspaceFromApi(targetRepo.repo, null, targetRepo.id, targetRepo);
      setConnectedRepos((prev) => prev.map((repo) => (repo.id === repoId ? refreshedRepo : repo)));

      setActiveRepoId(repoId);
    });
  };

  const handleLogout = () => {
    setAuthStep("auth");
    setAuthToken(null);
    setUser(null);
    setConnectedRepos([]);
    setActiveRepoId(null);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  };

  const updateActiveRepo = (updater) => {
    setConnectedRepos((prev) => prev.map((repo) => (repo.id === activeRepoId ? updater(repo) : repo)));
  };

  const setRepoPage = (nextPage) => {
    updateActiveRepo((repo) => ({
      ...repo,
      currentPage: nextPage,
    }));
  };

  const setActiveInbox = async (updater) => {
    await runWithGlobalLoading(async () => {
      const currentInbox = activeRepo?.inbox || [];
      const nextInbox = typeof updater === "function" ? updater(currentInbox) : updater;
      const changedToRead = nextInbox.filter((nextMsg) => {
        const previous = currentInbox.find((msg) => msg.id === nextMsg.id);
        return nextMsg.read && previous && !previous.read;
      });

      await Promise.allSettled(
        changedToRead.map((message) => apiRequest(`/api/agent/inbox/${message.id}/read`, { method: "PATCH" }))
      );

      updateActiveRepo((repo) => ({
        ...repo,
        inbox: nextInbox,
      }));
    });
  };

  const setSelectedIssue = (issue) => {
    updateActiveRepo((repo) => ({
      ...repo,
      selectedIssueId: issue?.id || null,
    }));
  };

  const handleRunIssue = async (issueNumber) => {
    updateActiveRepo((repo) => ({ ...repo, lastRunError: null }));
    try {
      await runWithGlobalLoading(async () => {
        await apiRequest("/api/agent/run", {
          method: "POST",
          body: { issue_number: issueNumber },
        });
        await refreshActiveRepoData();
        setRepoPage("review");
      });
    } catch (error) {
      updateActiveRepo((repo) => ({
        ...repo,
        lastRunError: error.message || "Failed to start agent run",
      }));
      throw error;
    }
  };

  const handleMergeDecision = async (runId, approved) => {
    updateActiveRepo((repo) => ({ ...repo, lastRunError: null }));
    try {
      await runWithGlobalLoading(async () => {
        await apiRequest(`/api/agent/runs/${runId}/merge`, {
          method: "POST",
          body: { approved },
        });
        await refreshActiveRepoData();
      });
    } catch (error) {
      updateActiveRepo((repo) => ({
        ...repo,
        lastRunError: error.message || "Failed to submit merge decision",
      }));
      throw error;
    }
  };

  const handleLoadRunChanges = async (runId) => {
    return apiRequest(`/api/agent/runs/${runId}/changes`);
  };

  const handleDisconnect = async () => {
    await runWithGlobalLoading(async () => {
      await apiRequest("/api/repos/disconnect", { method: "DELETE" });

      setConnectedRepos((prev) => {
        const remainingRepos = prev.filter((repo) => repo.id !== activeRepoId);
        setActiveRepoId(remainingRepos[0]?.id || null);

        if (remainingRepos.length === 0) {
          setAuthStep("repo");
        }

        return remainingRepos;
      });

      if (connectedRepos.length <= 1) {
        setAuthStep("repo");
      }
    });
  };

  if (authStep === "auth") return <AuthPage onAuth={handleAuth} />;
  if (authStep === "repo") return <RepoSetup user={activeUser || user} onSetup={handleRepoSetup} />;

  return (
    <div className="scanline-overlay min-h-screen md:flex">
      {isGlobalLoading && <div className="global-loading-bar fixed left-0 right-0 top-0 z-50 md:left-[220px]" />}
      <Sidebar
        page={page}
        setPage={setRepoPage}
        user={activeUser}
        inbox={inbox}
        onAddRepo={handleAddRepo}
        repos={connectedRepos}
        activeRepoId={activeRepoId}
        onSwitchRepo={handleSwitchRepo}
      />
      <main key={activeRepoId || "no-repo"} className="min-h-screen flex-1 md:ml-[220px]">
        <div className="sticky top-0 z-10 border-b px-3 py-3 md:hidden" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800 }}>
              <span style={{ color: "var(--accent)" }}>git</span>
              <span style={{ color: "var(--text)" }}>agent</span>
              <span style={{ color: "var(--accent)", fontSize: 20 }}>.</span>
            </div>
            <button
              onClick={handleAddRepo}
              className="rounded border px-2.5 py-1.5"
              style={{
                fontSize: 10,
                color: "var(--muted2)",
                background: "var(--bg3)",
                borderColor: "var(--border)",
                fontFamily: "var(--font-mono)",
              }}
            >
              ADD REPO
            </button>
          </div>
          <div className="mb-3 truncate" style={{ fontSize: 10, color: "var(--muted)" }}>
            ACTIVE REPO: {activeRepo?.repo?.split("/").slice(-2).join("/") || "none"}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setRepoPage(item.id)}
                className="shrink-0 rounded border px-3 py-1.5"
                style={{
                  fontSize: 10,
                  letterSpacing: ".06em",
                  background: page === item.id ? "var(--bg3)" : "transparent",
                  borderColor: page === item.id ? "var(--accent)" : "var(--border)",
                  color: page === item.id ? "var(--text)" : "var(--muted2)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {item.label.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {page === "dashboard" && <Dashboard issues={issues} commits={commits} inbox={inbox} setPage={setRepoPage} />}
        {page === "issues" && <IssuesPage issues={issues} setPage={setRepoPage} setSelectedIssue={setSelectedIssue} onRetry={handleRunIssue} />}
        {page === "commits" && <CommitsPage commits={commits} />}
        {page === "review" && <ReviewPage runs={activeRepo?.runs || []} onDecision={handleMergeDecision} onLoadRunChanges={handleLoadRunChanges} errorMessage={activeRepo?.lastRunError} />}
        {page === "resolver" && <ResolverPage issue={selectedIssue} issues={issues} onRunIssue={handleRunIssue} errorMessage={activeRepo?.lastRunError} />}
        {page === "inbox" && (
          <InboxPage
            inbox={inbox}
            setInbox={setActiveInbox}
            setPage={setRepoPage}
            setSelectedIssue={setSelectedIssue}
            issues={issues}
            repoName={activeRepo?.repo}
          />
        )}
        {page === "profile" && <ProfilePage user={profileUser} onDisconnect={handleDisconnect} onLogout={handleLogout} />}
      </main>
    </div>
  );
}
