import { Cursor, IssueStateDot, Tag } from "../ui/Primitives";

export default function Dashboard({ issues, commits, inbox, setPage }) {
    const open = issues.filter((i) => i.state === "open").length;
    const solving = issues.filter((i) => i.state === "solving").length;
    const review = issues.filter((i) => i.state === "review").length;
    const merged = issues.filter((i) => i.state === "merged").length;
    const unread = inbox.filter((m) => !m.read).length;

    return (
        <div className="p-4 md:p-8">
            <div className="animate-fadeUp mb-7">
                <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, marginBottom: 4 }}>
                    Command Center <Cursor />
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>// real-time overview of agent activity</div>
            </div>

            <div className="animate-fadeUp delay-1 mb-7 grid grid-cols-1 gap-3 md:grid-cols-4">
                {[
                    { label: "OPEN ISSUES", value: open, color: "var(--accent2)", icon: "⊡" },
                    { label: "AI SOLVING", value: solving, color: "var(--accent)", icon: "⟳" },
                    { label: "IN REVIEW", value: review, color: "var(--accent4)", icon: "◎" },
                    { label: "MERGED", value: merged, color: "var(--muted2)", icon: "✓" },
                ].map((s) => (
                    <div key={s.label} className="rounded-lg border p-5" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                        <div className="flex items-start justify-between">
                            <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--font-display)", color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: 18, color: s.color, opacity: 0.6 }}>{s.icon}</div>
                        </div>
                        <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: ".1em", marginTop: 4 }}>{s.label}</div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="animate-fadeUp delay-2 rounded-lg border" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                    <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em" }}>RECENT ISSUES</span>
                        <button onClick={() => setPage("issues")} style={{ fontSize: 10, color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>
                            {"view all ->"}
                        </button>
                    </div>
                    {issues.slice(0, 4).map((issue) => (
                        <div key={issue.id} className="flex items-center gap-3 border-b px-5 py-3" style={{ borderColor: "var(--border)" }}>
                            <IssueStateDot state={issue.state} />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-xs">#{issue.number} {issue.title}</div>
                            </div>
                            {issue.pr && <Tag color="blue">PR{issue.pr}</Tag>}
                        </div>
                    ))}
                </div>

                <div className="animate-fadeUp delay-3 rounded-lg border" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                    <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em" }}>LATEST COMMITS</span>
                        <button onClick={() => setPage("commits")} style={{ fontSize: 10, color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>
                            {"view all ->"}
                        </button>
                    </div>
                    {commits.slice(0, 4).map((c) => (
                        <div key={c.hash} className="border-b px-5 py-3" style={{ borderColor: "var(--border)" }}>
                            <div className="flex items-start gap-2">
                                <code style={{ fontSize: 10, color: "var(--accent)", background: "var(--bg4)", padding: "1px 5px", borderRadius: 3 }}>{c.hash}</code>
                                <div className="truncate text-xs">{c.msg}</div>
                            </div>
                            <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>{c.time} · {c.branch}</div>
                        </div>
                    ))}
                </div>

                {unread > 0 && (
                    <div className="animate-fadeUp delay-4 rounded-lg border xl:col-span-2" style={{ background: "var(--bg2)", borderColor: "rgba(255,107,107,.25)" }}>
                        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "var(--accent3)" }}>INBOX - {unread} UNREAD</span>
                            <button onClick={() => setPage("inbox")} style={{ fontSize: 10, color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>
                                {"open inbox ->"}
                            </button>
                        </div>
                        {inbox.filter((m) => !m.read).map((m) => (
                            <div key={m.id} className="border-b px-5 py-3" style={{ borderColor: "var(--border)" }}>
                                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 3 }}>{m.title}</div>
                                <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5 }}>{m.body}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
