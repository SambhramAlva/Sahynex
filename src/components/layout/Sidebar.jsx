import { Badge } from "../ui/Primitives";

export default function Sidebar({ page, setPage, user, inbox, onAddRepo, repos = [], activeRepoId, onSwitchRepo }) {
    const items = [
        { id: "dashboard", icon: "▦", label: "Dashboard" },
        { id: "issues", icon: "⊡", label: "Issues" },
        { id: "commits", icon: "◈", label: "Commits" },
        { id: "review", icon: "◎", label: "Review" },
        { id: "resolver", icon: "⟳", label: "Resolver" },
        { id: "inbox", icon: "✉", label: "Inbox", badge: inbox.filter((m) => !m.read).length },
        { id: "profile", icon: "◉", label: "Profile" },
    ];

    return (
        <aside
            className="fixed left-0 top-0 z-20 hidden h-screen w-[220px] flex-col border-r md:flex"
            style={{ background: "var(--bg2)", borderColor: "var(--border)" }}
        >
            <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>
                    <span style={{ color: "var(--accent)" }}>git</span>
                    <span style={{ color: "var(--text)" }}>agent</span>
                    <span style={{ color: "var(--accent)", fontSize: 22 }}>.</span>
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4, letterSpacing: ".1em" }}>
                    AI-POWERED DEVOPS
                </div>
            </div>

            {user?.repo && (
                <div style={{ margin: "14px 14px 0" }}>
                    <div
                        style={{
                            background: "var(--bg3)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            padding: "8px 10px",
                        }}
                    >
                        <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: ".08em", marginBottom: 3 }}>ACTIVE REPO</div>
                        <div
                            style={{
                                fontSize: 11,
                                color: "var(--accent2)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {user.repo.split("/").slice(-2).join("/")}
                        </div>
                    </div>

                    <button
                        onClick={onAddRepo}
                        style={{
                            marginTop: 10,
                            background: "var(--bg3)",
                            border: "1px dashed var(--border2)",
                            borderRadius: 6,
                            padding: "10px",
                            width: "100%",
                            textAlign: "left",
                            cursor: "pointer",
                        }}
                    >
                        <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: ".08em" }}>ADD REPO</div>
                    </button>

                    {repos.length > 1 && (
                        <div
                            style={{
                                marginTop: 10,
                                background: "var(--bg3)",
                                border: "1px solid var(--border)",
                                borderRadius: 6,
                                padding: "8px",
                            }}
                        >
                            <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: ".08em", marginBottom: 6 }}>REPO WINDOWS</div>
                            <div style={{ display: "grid", gap: 6 }}>
                                {repos.map((repo) => {
                                    const isActive = repo.id === activeRepoId;

                                    return (
                                        <button
                                            key={repo.id}
                                            onClick={() => onSwitchRepo(repo.id)}
                                            style={{
                                                width: "100%",
                                                padding: "8px",
                                                borderRadius: 4,
                                                border: isActive ? "1px solid var(--accent)" : "1px solid var(--border)",
                                                background: isActive ? "rgba(0,255,163,.08)" : "var(--bg4)",
                                                color: isActive ? "var(--text)" : "var(--muted2)",
                                                cursor: "pointer",
                                                textAlign: "left",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    fontSize: 10,
                                                    fontFamily: "var(--font-mono)",
                                                    letterSpacing: ".04em",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {repo.repo.split("/").slice(-2).join("/")}
                                            </div>
                                            <div style={{ fontSize: 9, color: isActive ? "var(--accent)" : "var(--muted)", marginTop: 3 }}>
                                                {isActive ? "ACTIVE WINDOW" : "SWITCH TO WINDOW"}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <nav style={{ flex: 1, padding: "12px 0", overflowY: "auto" }}>
                {items.map((it) => (
                    <button
                        key={it.id}
                        onClick={() => setPage(it.id)}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            width: "100%",
                            padding: "10px 20px",
                            background: page === it.id ? "var(--bg3)" : "transparent",
                            border: "none",
                            borderLeft: page === it.id ? "2px solid var(--accent)" : "2px solid transparent",
                            color: page === it.id ? "var(--text)" : "var(--muted)",
                            cursor: "pointer",
                            fontSize: 12,
                            fontFamily: "var(--font-mono)",
                            textAlign: "left",
                        }}
                    >
                        <span style={{ fontSize: 14, color: page === it.id ? "var(--accent)" : "inherit" }}>{it.icon}</span>
                        {it.label}
                        {it.badge > 0 && <Badge n={it.badge} />}
                    </button>
                ))}
            </nav>

            <div style={{ padding: "14px 16px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                <div
                    style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "var(--bg4)",
                        border: "1px solid var(--accent)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        color: "var(--accent)",
                        fontWeight: 700,
                    }}
                >
                    {user?.name?.[0]?.toUpperCase() || "?"}
                </div>
                <div>
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{user?.name || "User"}</div>
                    <div style={{ fontSize: 9, color: "var(--muted)" }}>CONNECTED</div>
                </div>
            </div>
        </aside>
    );
}
