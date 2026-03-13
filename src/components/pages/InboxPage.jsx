import { Cursor } from "../ui/Primitives";

export default function InboxPage({ inbox, setInbox, setPage, setSelectedIssue, issues }) {
    const markRead = (id) => setInbox((prev) => prev.map((m) => (m.id === id ? { ...m, read: true } : m)));
    const markAllRead = () => setInbox((prev) => prev.map((m) => ({ ...m, read: true })));

    return (
        <div className="p-4 md:p-8">
            <div className="animate-fadeUp mb-6 flex items-start justify-between gap-3">
                <div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Inbox <Cursor /></div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>// messages from the AI agent</div>
                </div>
                <button
                    onClick={markAllRead}
                    className="rounded border px-3 py-1.5"
                    style={{ fontSize: 10, color: "var(--muted)", background: "var(--bg2)", borderColor: "var(--border)", fontFamily: "var(--font-mono)", cursor: "pointer" }}
                >
                    mark all read
                </button>
            </div>

            <div className="animate-fadeUp delay-1 rounded-lg border" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                {inbox.map((msg, i) => (
                    <div
                        key={msg.id}
                        className="animate-slideIn border-b px-5 py-4"
                        style={{
                            borderColor: "var(--border)",
                            background: !msg.read ? "rgba(0,229,160,.03)" : "transparent",
                            borderLeft: !msg.read ? "2px solid var(--accent)" : "2px solid transparent",
                            animationDelay: `${i * 0.05}s`,
                            cursor: "pointer",
                        }}
                        onClick={() => markRead(msg.id)}
                    >
                        <div className="mb-2 flex items-start justify-between gap-3">
                            <span style={{ fontSize: 12, fontWeight: 700, color: !msg.read ? "var(--text)" : "var(--muted2)" }}>{msg.title}</span>
                            <span style={{ fontSize: 9, color: "var(--muted)" }}>{msg.time}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6, marginBottom: 10 }}>{msg.body}</div>
                        <div className="flex flex-wrap gap-2">
                            {msg.type === "merge_request" && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setPage("review");
                                    }}
                                    className="rounded px-3 py-1.5"
                                    style={{ background: "var(--accent)", color: "var(--bg)", border: "none", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                                >
                                    {"REVIEW PR ->"}
                                </button>
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const iss = issues.find((i2) => i2.number === msg.issue);
                                    if (iss) {
                                        setSelectedIssue(iss);
                                        setPage("resolver");
                                    }
                                }}
                                className="rounded border px-3 py-1.5"
                                style={{ background: "transparent", color: "var(--muted)", borderColor: "var(--border)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer" }}
                            >
                                view issue #{msg.issue}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
