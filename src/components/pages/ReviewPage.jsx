import { useState } from "react";
import { Cursor, Tag } from "../ui/Primitives";

export default function ReviewPage() {
    const prs = [
        {
            id: 89,
            title: "Fix memory leak in WebSocket handler",
            issue: 42,
            branch: "fix/issue-42-ws-memleak",
            status: "ready",
            checks: "3/3",
            additions: 47,
            deletions: 12,
            review:
                "Added listener cleanup, connection map clear, and ping interval teardown. Existing tests pass with added cleanup edge-case coverage.",
            diff: "@@ -142,8 +142,15 @@ class WebSocketHandler {\n cleanup() {\n- this.connections.forEach(c => c.close());\n+ this.connections.forEach(c => {\n+ if (c.readyState !== WebSocket.CLOSED) {\n+ c.close();\n+ }\n+ c.removeAllListeners();\n+ });\n+ this.connections.clear();\n+ clearInterval(this.pingInterval);\n }",
        },
        {
            id: 85,
            title: "Bump dependency versions",
            issue: 31,
            branch: "chore/issue-31-deps",
            status: "approved",
            checks: "3/3",
            additions: 18,
            deletions: 18,
            review: "Updated dependencies with no breaking API changes detected.",
            diff: "@@ -12,9 +12,9 @@\n dependencies {\n- express: 4.18.1\n+ express: 4.19.2\n }",
        },
    ];

    const [selected, setSelected] = useState(prs[0]);

    return (
        <div className="p-4 md:p-8">
            <div className="animate-fadeUp mb-6">
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Review Panel <Cursor /></div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>// pull requests awaiting your approval</div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr]">
                <div className="animate-fadeUp delay-1 rounded-lg border" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                    {prs.map((pr) => (
                        <div
                            key={pr.id}
                            onClick={() => setSelected(pr)}
                            style={{
                                padding: "14px 16px",
                                borderBottom: "1px solid var(--border)",
                                cursor: "pointer",
                                background: selected?.id === pr.id ? "var(--bg3)" : "transparent",
                                borderLeft: selected?.id === pr.id ? "2px solid var(--accent)" : "2px solid transparent",
                            }}
                        >
                            <div style={{ fontSize: 11, marginBottom: 5 }}>
                                <span style={{ color: "var(--muted)" }}>#{pr.id}</span> {pr.title}
                            </div>
                            <div className="flex items-center gap-2">
                                <Tag color={pr.status === "ready" ? "yellow" : "accent"}>{pr.status}</Tag>
                                <span style={{ fontSize: 9, color: "var(--muted)" }}>checks {pr.checks}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="animate-fadeUp delay-2 rounded-lg border" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                    <div className="border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>PR #{selected.id}: {selected.title}</div>
                        <div className="flex items-center gap-2">
                            <code style={{ fontSize: 9, color: "var(--muted)" }}>{selected.branch}</code>
                            <span style={{ fontSize: 9, color: "var(--muted)" }}>to main</span>
                        </div>
                    </div>
                    <div className="border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                        <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: ".1em", marginBottom: 8 }}>DIFF</div>
                        <pre className="overflow-auto rounded-md border p-3 text-xs" style={{ background: "var(--bg)", borderColor: "var(--border)", fontFamily: "var(--font-mono)" }}>
                            {selected.diff}
                        </pre>
                    </div>
                    <div className="px-5 py-4">
                        <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: ".1em", marginBottom: 8 }}>AI REVIEW SUMMARY</div>
                        <div className="rounded-md border-l-2 p-3 text-xs" style={{ background: "var(--bg3)", borderLeftColor: "var(--accent)", lineHeight: 1.7 }}>
                            {selected.review}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
