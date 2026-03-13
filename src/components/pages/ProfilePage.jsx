import { Cursor, Tag } from "../ui/Primitives";

export default function ProfilePage({ user, onDisconnect }) {
    const connectedRepos = user?.repos || [];

    return (
        <div className="p-4 md:p-8">
            <div className="animate-fadeUp mb-6">
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Profile <Cursor /></div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>// account and workspace configuration</div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="animate-fadeUp delay-1 rounded-lg border p-6 lg:col-span-2" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-4">
                        <div
                            style={{
                                width: 56,
                                height: 56,
                                borderRadius: "50%",
                                background: "var(--bg4)",
                                border: "2px solid var(--accent)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 22,
                                fontWeight: 700,
                                color: "var(--accent)",
                                fontFamily: "var(--font-display)",
                            }}
                        >
                            {user?.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700 }}>{user?.name}</div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>{user?.email}</div>
                        </div>
                        <Tag color="accent">ACTIVE</Tag>
                    </div>
                </div>

                <div className="animate-fadeUp delay-2 rounded-lg border p-5" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", marginBottom: 16, color: "var(--muted)" }}>GITHUB CONNECTION</div>
                    <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 4 }}>CONNECTED REPOS</div>
                    <div style={{ fontSize: 12, color: "var(--muted2)", marginBottom: 12 }}>{connectedRepos.length}</div>
                    <div style={{ display: "grid", gap: 8 }}>
                        {connectedRepos.map((repo) => (
                            <div key={repo.id} className="rounded border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg3)" }}>
                                <div style={{ fontSize: 11, color: "var(--accent2)", marginBottom: 4 }}>{repo.repo}</div>
                                <div style={{ fontSize: 9, color: "var(--muted2)" }}>
                                    {repo.token ? `${repo.token.slice(0, 4)}***************` : "token unavailable"}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="animate-fadeUp delay-3 rounded-lg border p-5" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", marginBottom: 16, color: "var(--muted)" }}>AGENT CONFIGURATION</div>
                    {[
                        ["WORKING BRANCH PREFIX", "fix/, feat/, chore/"],
                        ["TARGET BRANCH", "main"],
                        ["AUTO-ASSIGN ISSUES", "Enabled"],
                        ["PR REVIEW REQUIRED", "Yes"],
                        ["TEST RUNNER", "npm test"],
                    ].map(([k, v]) => (
                        <div key={k} className="mb-2 flex justify-between text-xs">
                            <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: ".06em" }}>{k}</span>
                            <span style={{ color: "var(--muted2)" }}>{v}</span>
                        </div>
                    ))}
                </div>

                <div className="animate-fadeUp delay-4 rounded-lg border p-5 lg:col-span-2" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", marginBottom: 16, color: "var(--muted)" }}>WORKSPACE SUMMARY</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        {[
                            ["CONNECTED REPOS", connectedRepos.length],
                            ["ACCOUNT EMAIL", user?.email || "-"],
                            ["SESSION", "ACTIVE"],
                        ].map(([label, value]) => (
                            <div key={label} className="rounded border p-4" style={{ borderColor: "var(--border)", background: "var(--bg3)" }}>
                                <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: ".08em", marginBottom: 6 }}>{label}</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--font-display)" }}>{value}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="animate-fadeUp delay-5 rounded-lg border p-5 lg:col-span-2" style={{ background: "var(--bg2)", borderColor: "rgba(255,107,107,.2)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", marginBottom: 14, color: "var(--accent3)" }}>DANGER ZONE</div>
                    <button
                        onClick={onDisconnect}
                        className="rounded border px-4 py-2"
                        style={{ background: "transparent", color: "var(--accent3)", borderColor: "var(--accent3)", fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer" }}
                    >
                        DISCONNECT REPO
                    </button>
                </div>
            </div>
        </div>
    );
}
