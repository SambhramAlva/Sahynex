import { useState } from "react";
import { Cursor, IssueStateDot, Spinner, Tag } from "../ui/Primitives";

export default function ResolverPage({ issue, issues = [], onRunIssue, errorMessage }) {
    const [manualRunning, setManualRunning] = useState(false);
    const display = issue || issues[0];
    const isAutoProcessing = display?.state === "solving" || display?.state === "review";
    const statusBadgeLabel = display?.state === "review"
        ? "READY FOR APPROVAL"
        : display?.state === "solving"
            ? "AUTO SOLVING"
            : "MANUAL AVAILABLE";
    const statusBadgeColor = display?.state === "review"
        ? "var(--accent4)"
        : display?.state === "solving"
            ? "var(--accent)"
            : "var(--accent2)";
    const manualHint = isAutoProcessing
        ? display.state === "review"
            ? "Preview is ready in Review. You only need to approve or reject the merge."
            : "This issue is already queued or being solved automatically."
        : "Use manual run only if the automatic flow gets stuck.";

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
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, overflowWrap: "anywhere" }}>#{display.number} {display.title}</div>
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

                <div className="mt-4 rounded border px-3 py-2" style={{ borderColor: "var(--accent2)", background: "rgba(123,173,255,.08)", color: "var(--text)", fontSize: 11, lineHeight: 1.7 }}>
                    New issues are queued automatically. The AI agent prepares the fix and PR preview on its own, and you only need to review and approve the merge. If something gets stuck, you can still trigger a manual run.
                </div>

                <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <button
                        onClick={async () => {
                            if (manualRunning) {
                                return;
                            }
                            setManualRunning(true);
                            try {
                                await onRunIssue?.(display.number);
                            } catch {
                                // Error is surfaced from parent state.
                            } finally {
                                setManualRunning(false);
                            }
                        }}
                        className="rounded border px-4 py-2"
                        style={{
                            background: "transparent",
                            color: isAutoProcessing || manualRunning ? "var(--muted)" : "var(--accent2)",
                            borderColor: isAutoProcessing || manualRunning ? "var(--border)" : "var(--accent2)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            cursor: isAutoProcessing || manualRunning ? "not-allowed" : "pointer",
                            opacity: isAutoProcessing || manualRunning ? 0.7 : 1,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                        }}
                        disabled={isAutoProcessing || manualRunning}
                    >
                        {manualRunning && <Spinner />}
                        {manualRunning ? "RUNNING..." : `MANUAL FALLBACK: RUN AGENT ON ISSUE #${display.number}`}
                    </button>
                    <span
                        className="rounded-full border px-3 py-1"
                        style={{
                            borderColor: `${statusBadgeColor}33`,
                            color: statusBadgeColor,
                            background: `${statusBadgeColor}12`,
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            letterSpacing: ".08em",
                            fontWeight: 700,
                            textTransform: "uppercase",
                        }}
                    >
                        {statusBadgeLabel}
                    </span>
                </div>

                <div style={{ marginTop: 8, fontSize: 10, color: "var(--muted)" }}>
                    {manualHint}
                </div>

                <div className="mt-3 rounded border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--muted2)", fontSize: 11, lineHeight: 1.7 }}>
                    Issue description format: <strong>FilePath:</strong> path/to/file.ext <strong>| Changes:</strong> explain the exact update for that file. Use one FilePath/Changes block per file.
                </div>

                {errorMessage && (
                    <div className="mt-3 rounded border px-3 py-2" style={{ borderColor: "var(--accent3)", background: "rgba(255,95,95,.08)", color: "var(--accent3)", fontSize: 11 }}>
                        Agent run error: {errorMessage}
                    </div>
                )}
            </div>

            <div className="animate-fadeUp delay-2 rounded-lg border" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2 border-b px-5 py-3" style={{ borderColor: "var(--border)" }}>
                    <span style={{ fontSize: 10, color: "var(--muted)" }}>Issue Description</span>
                </div>
                <div className="px-4 py-4 md:px-5" style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.8, whiteSpace: "pre-wrap", color: "var(--muted2)", overflowWrap: "anywhere" }}>
                    {display.body?.trim() || "No description is available for this issue."}
                </div>
            </div>
        </div>
    );
}
