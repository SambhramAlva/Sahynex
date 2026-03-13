import { Cursor, IssueStateDot, Spinner, Tag } from "../ui/Primitives";

export default function ResolverPage({ issue, issues = [], onRunIssue, errorMessage }) {
    const logs = [
        { t: "00:00", txt: "Fetching issue #42 from GitHub API...", type: "info" },
        { t: "00:03", txt: "Creating branch: fix/issue-42-ws-memleak", type: "success" },
        { t: "00:09", txt: "Identified root cause in cleanup flow.", type: "warn" },
        { t: "00:15", txt: "Applied patch to websocket handler", type: "success" },
        { t: "00:31", txt: "Tests passed: 47/47", type: "success" },
        { t: "00:41", txt: "Complete. Awaiting human approval.", type: "complete" },
    ];

    const display = issue || issues[0];

    if (!display) {
        return (
            <div className="p-4 md:p-8">
                <div className="animate-fadeUp mb-6">
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Issue Resolver <Cursor /></div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>// trace agent execution step-by-step</div>
                </div>

                <div className="animate-fadeUp delay-1 rounded-lg border p-5" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                    <div style={{ fontSize: 12, color: "var(--muted2)" }}>No issue selected for this repository yet.</div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8">
            <div className="animate-fadeUp mb-6">
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Issue Resolver <Cursor /></div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>// trace agent execution step-by-step</div>
            </div>

            <div className="animate-fadeUp delay-1 mb-4 rounded-lg border p-5" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                <div className="flex items-start gap-3">
                    <IssueStateDot state={display.state} />
                    <div className="flex-1">
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>#{display.number} {display.title}</div>
                        <div className="flex flex-wrap gap-2">
                            {display.labels.map((l) => (
                                <Tag key={l} color={l === "bug" || l === "critical" ? "red" : "blue"}>{l}</Tag>
                            ))}
                        </div>
                    </div>
                    <div className="text-right">
                        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--font-display)" }}>{display.progress}%</div>
                        <div style={{ fontSize: 9, color: "var(--muted)" }}>COMPLETE</div>
                    </div>
                </div>

                <div style={{ marginTop: 14 }}>
                    <button
                        onClick={async () => {
                            try {
                                await onRunIssue?.(display.number);
                            } catch {
                                // Error is surfaced from parent state.
                            }
                        }}
                        className="rounded border px-4 py-2"
                        style={{
                            background: "var(--accent)",
                            color: "var(--bg)",
                            borderColor: "var(--accent)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            cursor: "pointer",
                        }}
                    >
                        RUN AGENT ON ISSUE #{display.number}
                    </button>
                </div>

                {errorMessage && (
                    <div className="mt-3 rounded border px-3 py-2" style={{ borderColor: "var(--accent3)", background: "rgba(255,95,95,.08)", color: "var(--accent3)", fontSize: 11 }}>
                        Agent run error: {errorMessage}
                    </div>
                )}
            </div>

            <div className="animate-fadeUp delay-2 rounded-lg border" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2 border-b px-5 py-3" style={{ borderColor: "var(--border)" }}>
                    <span style={{ fontSize: 10, color: "var(--muted)" }}>gitAgent execution log</span>
                    {display.state === "solving" && (
                        <span className="ml-auto flex items-center gap-2" style={{ fontSize: 10, color: "var(--accent)" }}>
                            <Spinner /> RUNNING
                        </span>
                    )}
                </div>
                <div className="px-5 py-4" style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 2 }}>
                    {logs.map((log, i) => (
                        <div key={i} className="animate-fadeUp flex gap-3" style={{ animationDelay: `${i * 0.06}s` }}>
                            <span style={{ color: "var(--muted)", minWidth: 40 }}>{log.t}</span>
                            <span style={{ color: log.type === "success" || log.type === "complete" ? "var(--accent)" : log.type === "warn" ? "var(--accent4)" : "var(--muted2)" }}>
                                {log.type === "success" ? "OK" : log.type === "warn" ? "WARN" : log.type === "complete" ? "DONE" : "INFO"}
                            </span>
                            <span style={{ color: "var(--muted2)" }}>{log.txt}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
