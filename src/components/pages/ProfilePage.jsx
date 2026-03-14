import { useState } from "react";
import { Cursor, Tag } from "../ui/Primitives";

export default function ProfilePage({ user, onDisconnect, onLogout, onUpdateGithubToken }) {
    const connectedRepos = user?.repos || [];
    const [pendingAction, setPendingAction] = useState("");
    const [tokenDraft, setTokenDraft] = useState("");
    const [showTokenEditor, setShowTokenEditor] = useState(false);
    const [tokenMessage, setTokenMessage] = useState("");
    const [tokenError, setTokenError] = useState("");

    return (
        <div className="p-4 md:p-8">
            <div className="animate-fadeUp mb-6">
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Profile <Cursor /></div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>// account and workspace configuration</div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="animate-fadeUp delay-1 rounded-lg border p-6 lg:col-span-2" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                    <div className="flex flex-wrap items-center gap-4">
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
                            <div style={{ fontSize: 11, color: "var(--muted)", overflowWrap: "anywhere" }}>{user?.email}</div>
                        </div>
                        <Tag color="accent">ACTIVE</Tag>
                    </div>
                </div>

                <div className="animate-fadeUp delay-2 rounded-lg border p-5" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", marginBottom: 16, color: "var(--muted)" }}>GITHUB CONNECTION</div>
                    <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 4 }}>CONNECTED REPOS</div>
                    <div style={{ fontSize: 12, color: "var(--muted2)", marginBottom: 12 }}>{connectedRepos.length}</div>
                    <div className="mb-4 rounded border px-3 py-3" style={{ borderColor: "var(--border)", background: "var(--bg3)" }}>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: ".08em", marginBottom: 4 }}>GITHUB TOKEN</div>
                                <div style={{ fontSize: 11, color: "var(--muted2)" }}>
                                    {connectedRepos[0]?.token ? `${connectedRepos[0].token.slice(0, 4)}***************` : "token unavailable"}
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    if (pendingAction) {
                                        return;
                                    }
                                    setShowTokenEditor((prev) => !prev);
                                    setTokenDraft("");
                                    setTokenError("");
                                    setTokenMessage("");
                                }}
                                className="rounded border px-3 py-1.5"
                                style={{
                                    background: "transparent",
                                    color: "var(--accent2)",
                                    borderColor: "var(--accent2)",
                                    fontFamily: "var(--font-mono)",
                                    fontSize: 10,
                                    cursor: pendingAction ? "wait" : "pointer",
                                }}
                            >
                                {showTokenEditor ? "CANCEL" : "EDIT TOKEN"}
                            </button>
                        </div>
                        {showTokenEditor && (
                            <>
                                <input
                                    type="password"
                                    value={tokenDraft}
                                    onChange={(event) => setTokenDraft(event.target.value)}
                                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                                    className="mb-3 w-full rounded-md border px-3 py-2 text-xs outline-none"
                                    style={{
                                        background: "var(--bg2)",
                                        borderColor: "var(--border)",
                                        color: "var(--text)",
                                        fontFamily: "var(--font-mono)",
                                    }}
                                />
                                {tokenError && (
                                    <div className="mb-3 rounded border px-3 py-2" style={{ borderColor: "var(--accent3)", background: "rgba(255,95,95,.08)", color: "var(--accent3)", fontSize: 11 }}>
                                        {tokenError}
                                    </div>
                                )}
                                {tokenMessage && (
                                    <div className="mb-3 rounded border px-3 py-2" style={{ borderColor: "var(--accent)", background: "rgba(0,229,160,.08)", color: "var(--accent)", fontSize: 11 }}>
                                        {tokenMessage}
                                    </div>
                                )}
                                <button
                                    onClick={async () => {
                                        if (pendingAction) {
                                            return;
                                        }
                                        if (!tokenDraft.trim()) {
                                            setTokenError("Enter a GitHub token.");
                                            setTokenMessage("");
                                            return;
                                        }
                                        setPendingAction("token");
                                        setTokenError("");
                                        setTokenMessage("");
                                        try {
                                            await onUpdateGithubToken?.(tokenDraft);
                                            setTokenMessage("GitHub token updated.");
                                            setTokenDraft("");
                                            setShowTokenEditor(false);
                                        } catch (error) {
                                            setTokenError(error?.message || "Failed to update GitHub token.");
                                        } finally {
                                            setPendingAction("");
                                        }
                                    }}
                                    disabled={Boolean(pendingAction)}
                                    className="rounded border px-4 py-2"
                                    style={{
                                        background: "var(--accent)",
                                        color: "var(--bg)",
                                        borderColor: "var(--accent)",
                                        fontFamily: "var(--font-mono)",
                                        fontSize: 10,
                                        cursor: pendingAction ? "wait" : "pointer",
                                        opacity: pendingAction && pendingAction !== "token" ? 0.7 : 1,
                                    }}
                                >
                                    {pendingAction === "token" ? "UPDATING TOKEN..." : "SAVE TOKEN"}
                                </button>
                            </>
                        )}
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                        {connectedRepos.map((repo) => (
                            <div key={repo.id} className="rounded border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg3)" }}>
                                <div style={{ fontSize: 11, color: "var(--accent2)", marginBottom: 4, overflowWrap: "anywhere" }}>{repo.repo}</div>
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
                        <div key={k} className="mb-2 flex flex-wrap justify-between gap-1 text-xs">
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
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                            onClick={async () => {
                                if (pendingAction) {
                                    return;
                                }
                                setPendingAction("disconnect");
                                try {
                                    await onDisconnect?.();
                                } finally {
                                    setPendingAction("");
                                }
                            }}
                            disabled={Boolean(pendingAction)}
                            className="rounded border px-4 py-2"
                            style={{ background: "transparent", color: "var(--accent3)", borderColor: "var(--accent3)", fontFamily: "var(--font-mono)", fontSize: 11, cursor: pendingAction ? "wait" : "pointer", opacity: pendingAction && pendingAction !== "disconnect" ? 0.7 : 1 }}
                        >
                            {pendingAction === "disconnect" ? "DISCONNECTING..." : "DISCONNECT REPO"}
                        </button>
                        <button
                            onClick={async () => {
                                if (pendingAction) {
                                    return;
                                }
                                setPendingAction("logout");
                                try {
                                    await onLogout?.();
                                } finally {
                                    setPendingAction("");
                                }
                            }}
                            disabled={Boolean(pendingAction)}
                            className="rounded border px-4 py-2"
                            style={{ background: "transparent", color: "var(--accent4)", borderColor: "var(--accent4)", fontFamily: "var(--font-mono)", fontSize: 11, cursor: pendingAction ? "wait" : "pointer", opacity: pendingAction && pendingAction !== "logout" ? 0.7 : 1 }}
                        >
                            {pendingAction === "logout" ? "LOGGING OUT..." : "LOG OUT"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
