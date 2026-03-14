import { useState } from "react";
import { Cursor, IssueStateDot, Spinner, Tag } from "../ui/Primitives";

export default function IssuesPage({ issues, setPage, setSelectedIssue, onRetry }) {
    const [filter, setFilter] = useState("all");
    const [retryingIssueId, setRetryingIssueId] = useState(null);
    const solvedStates = new Set(["review", "merged", "closed"]);
    const activeIssues = issues.filter((issue) => !solvedStates.has(issue.state));
    const solvedIssues = issues.filter((issue) => solvedStates.has(issue.state));
    const filteredActiveIssues = filter === "all" ? activeIssues : activeIssues.filter((issue) => issue.state === filter);

    const openIssue = (issue) => {
        setSelectedIssue(issue);
        setPage("resolver");
    };

    return (
        <div className="p-4 md:p-8">
            <div className="animate-fadeUp mb-6">
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Issues <Cursor /></div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>// tracked issues and agent assignments</div>
            </div>

            <div className="animate-fadeUp delay-1 mb-5 flex flex-wrap gap-2">
                {["all", "open", "solving"].map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                            padding: "6px 14px",
                            background: filter === f ? "var(--bg3)" : "transparent",
                            border: `1px solid ${filter === f ? "var(--border2)" : "var(--border)"}`,
                            borderRadius: 4,
                            color: filter === f ? "var(--text)" : "var(--muted)",
                            cursor: "pointer",
                            fontSize: 10,
                            fontFamily: "var(--font-mono)",
                            letterSpacing: ".06em",
                        }}
                    >
                        {f.toUpperCase()}
                    </button>
                ))}
            </div>

            <div className="animate-fadeUp delay-2 rounded-lg border" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                {filteredActiveIssues.length === 0 && (
                    <div className="px-4 py-6 md:px-5" style={{ fontSize: 11, color: "var(--muted2)" }}>
                        No active issues in this filter.
                    </div>
                )}
                {filteredActiveIssues.map((issue, i) => (
                    <div
                        key={issue.id}
                        className="animate-slideIn grid cursor-pointer grid-cols-[24px_1fr_auto] items-center gap-4 border-b px-4 py-3 md:grid-cols-[32px_1fr_auto_auto] md:px-5"
                        style={{ borderColor: "var(--border)", animationDelay: `${i * 0.04}s` }}
                        onClick={() => openIssue(issue)}
                    >
                        <IssueStateDot state={issue.state} />
                        <div>
                            <div style={{ fontSize: 12, marginBottom: 4 }}>
                                <span style={{ color: "var(--muted)", marginRight: 6 }}>#{issue.number}</span>
                                {issue.title}
                            </div>
                            {issue.branch && (
                                <code style={{ fontSize: 9, color: "var(--muted)", background: "var(--bg4)", padding: "1px 6px", borderRadius: 3 }}>
                                    {issue.branch}
                                </code>
                            )}
                        </div>
                        <div className="hidden gap-1 md:flex md:flex-wrap md:justify-end">
                            {issue.labels.map((l) => (
                                <Tag key={l} color={l === "bug" || l === "critical" ? "red" : l === "enhancement" || l === "feature" ? "blue" : "muted"}>
                                    {l}
                                </Tag>
                            ))}
                        </div>
                        <div className="text-right">
                            <div className="flex items-center justify-end gap-2">
                                {issue.state === "solving" && <Spinner />}
                                <span style={{ fontSize: 10, color: "var(--muted2)" }}>{issue.state.toUpperCase()}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="animate-fadeUp delay-3 mt-6 mb-3 flex items-center justify-between">
                <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700 }}>
                    Solved Issues
                </div>
                <span style={{ fontSize: 10, color: "var(--muted)" }}>{solvedIssues.length} total</span>
            </div>

            <div className="animate-fadeUp delay-3 rounded-lg border" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                {solvedIssues.length === 0 && (
                    <div className="px-4 py-6 md:px-5" style={{ fontSize: 11, color: "var(--muted2)" }}>
                        No solved issues yet.
                    </div>
                )}
                {solvedIssues.map((issue, i) => (
                    <div
                        key={`solved-${issue.id}`}
                        className="animate-slideIn grid grid-cols-1 gap-3 border-b px-4 py-3 md:grid-cols-[32px_1fr_auto] md:items-center md:gap-4 md:px-5"
                        style={{ borderColor: "var(--border)", animationDelay: `${i * 0.04}s` }}
                    >
                        <div className="hidden md:block">
                            <IssueStateDot state={issue.state} />
                        </div>
                        <div>
                            <div style={{ fontSize: 12, marginBottom: 4, overflowWrap: "anywhere" }}>
                                <span style={{ color: "var(--muted)", marginRight: 6 }}>#{issue.number}</span>
                                {issue.title}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Tag color={issue.state === "merged" ? "muted" : "yellow"}>{issue.state}</Tag>
                                {issue.pr && <Tag color="blue">PR{issue.pr}</Tag>}
                            </div>
                        </div>
                        <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                            <button
                                onClick={() => openIssue(issue)}
                                className="rounded border px-3 py-1.5"
                                style={{
                                    background: "transparent",
                                    color: "var(--muted2)",
                                    borderColor: "var(--border)",
                                    fontFamily: "var(--font-mono)",
                                    fontSize: 10,
                                    cursor: "pointer",
                                }}
                            >
                                VIEW
                            </button>
                            <button
                                onClick={async () => {
                                    if (retryingIssueId) {
                                        return;
                                    }
                                    if (issue.state === "review") {
                                        setPage("review");
                                        return;
                                    }
                                    setRetryingIssueId(issue.id);
                                    try {
                                        await onRetry?.(issue.number);
                                        setPage("review");
                                    } catch {
                                        // Error surfaced by parent.
                                    } finally {
                                        setRetryingIssueId(null);
                                    }
                                }}
                                disabled={Boolean(retryingIssueId)}
                                className="rounded border px-3 py-1.5"
                                style={{
                                    background: "transparent",
                                    color: "var(--accent2)",
                                    borderColor: "var(--accent2)",
                                    fontFamily: "var(--font-mono)",
                                    fontSize: 10,
                                    cursor: retryingIssueId ? "wait" : "pointer",
                                    opacity: retryingIssueId && retryingIssueId !== issue.id ? 0.7 : 1,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                }}
                            >
                                {retryingIssueId === issue.id && <Spinner />}
                                {issue.state === "review" ? "OPEN REVIEW" : retryingIssueId === issue.id ? "RETRYING..." : "RETRY"}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
