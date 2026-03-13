import { useState } from "react";
import { Cursor, IssueStateDot, Spinner, Tag } from "../ui/Primitives";

export default function IssuesPage({ issues, setPage, setSelectedIssue }) {
    const [filter, setFilter] = useState("all");
    const filtered = filter === "all" ? issues : issues.filter((i) => i.state === filter);

    return (
        <div className="p-4 md:p-8">
            <div className="animate-fadeUp mb-6">
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Issues <Cursor /></div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>// tracked issues and agent assignments</div>
            </div>

            <div className="animate-fadeUp delay-1 mb-5 flex flex-wrap gap-2">
                {["all", "open", "solving", "review", "merged"].map((f) => (
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
                {filtered.map((issue, i) => (
                    <div
                        key={issue.id}
                        className="animate-slideIn grid cursor-pointer grid-cols-[24px_1fr_auto] items-center gap-4 border-b px-4 py-3 md:grid-cols-[32px_1fr_auto_auto] md:px-5"
                        style={{ borderColor: "var(--border)", animationDelay: `${i * 0.04}s` }}
                        onClick={() => {
                            setSelectedIssue(issue);
                            setPage("resolver");
                        }}
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
        </div>
    );
}
