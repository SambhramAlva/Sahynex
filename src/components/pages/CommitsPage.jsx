import { Cursor, Tag } from "../ui/Primitives";

export default function CommitsPage({ commits }) {
    return (
        <div className="p-4 md:p-8">
            <div className="animate-fadeUp mb-6">
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Commit Log <Cursor /></div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>// all agent-authored commits across branches</div>
            </div>

            <div className="animate-fadeUp delay-1 rounded-lg border" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                {commits.map((c, i) => (
                    <div key={c.id || `${c.hash}-${c.issue}-${i}`} className="animate-slideIn border-b px-5 py-4" style={{ borderColor: "var(--border)", animationDelay: `${i * 0.05}s` }}>
                        <div className="mb-2 flex items-start gap-2">
                            <code style={{ fontSize: 11, color: "var(--accent)", background: "var(--bg4)", padding: "2px 8px", borderRadius: 4 }}>{c.hash}</code>
                            <span style={{ fontSize: 12, flex: 1, lineHeight: 1.5 }}>{c.msg}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <Tag color="muted">issue #{c.issue}</Tag>
                            <code style={{ fontSize: 9, color: "var(--muted)" }}>{c.branch}</code>
                            <span style={{ fontSize: 9, color: "var(--muted)", marginLeft: "auto" }}>{c.author} · {c.time}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
