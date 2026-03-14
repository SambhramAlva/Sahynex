import { useState } from "react";
import { Input, Spinner } from "../ui/Primitives";

export default function RepoSetup({ user, onSetup }) {
    const [form, setForm] = useState({ repo: "", token: "" });
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [showTokenField, setShowTokenField] = useState(false);
    const hasStoredToken = Boolean(user?.token || user?.repos?.some((repo) => repo.token));
    const requiresToken = !hasStoredToken || showTokenField;

    const submit = async () => {
        if (!form.repo) return;
        setErr("");
        setLoading(true);
        try {
            await onSetup(form);
        } catch (error) {
            setErr(error?.message || "Failed to connect repository.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <div className="animate-fadeUp w-full max-w-[500px] rounded-xl border p-5 sm:p-7 md:p-9" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "clamp(20px, 5.5vw, 22px)", fontWeight: 800, marginBottom: 4 }}>
                    {user?.repo ? "Add Repository" : "Connect Repository"}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 28 }}>
                    {user?.repo ? "// add another repo and keep the previous one available for switching" : "// link your GitHub repo to get started"}
                </div>

                <Input
                    label="GITHUB REPO URL"
                    value={form.repo}
                    onChange={(v) => setForm((p) => ({ ...p, repo: v }))}
                    placeholder="https://github.com/user/repository"
                />

                {hasStoredToken && !showTokenField && (
                    <div
                        style={{
                            fontSize: 11,
                            color: "var(--muted2)",
                            marginBottom: 16,
                            padding: "10px 12px",
                            background: "var(--bg3)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                        }}
                    >
                        Using the GitHub token already saved in your profile.
                        <button
                            type="button"
                            onClick={() => setShowTokenField(true)}
                            style={{
                                marginLeft: 8,
                                background: "none",
                                border: "none",
                                color: "var(--accent2)",
                                cursor: "pointer",
                                fontFamily: "var(--font-mono)",
                                fontSize: 10,
                                letterSpacing: ".06em",
                            }}
                        >
                            USE DIFFERENT TOKEN
                        </button>
                    </div>
                )}

                {requiresToken && (
                    <Input
                        label={hasStoredToken ? "GITHUB PERSONAL ACCESS TOKEN (OPTIONAL OVERRIDE)" : "GITHUB PERSONAL ACCESS TOKEN"}
                        type="password"
                        value={form.token}
                        onChange={(v) => setForm((p) => ({ ...p, token: v }))}
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    />
                )}

                <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 20, lineHeight: 1.6 }}>
                    Token scope needed: <strong>repo</strong>
                </div>

                {err && (
                    <div
                        style={{
                            fontSize: 11,
                            color: "var(--accent3)",
                            marginBottom: 14,
                            padding: "8px 10px",
                            background: "rgba(255,107,107,.08)",
                            border: "1px solid rgba(255,107,107,.2)",
                            borderRadius: 4,
                        }}
                    >
                        {err}
                    </div>
                )}

                <button
                    onClick={submit}
                    disabled={loading || !form.repo || (requiresToken && !form.token)}
                    className="flex w-full items-center justify-center gap-2 rounded-md border py-3 text-xs font-bold tracking-[.08em]"
                    style={{
                        background: !form.repo || (requiresToken && !form.token) ? "var(--bg4)" : "var(--accent)",
                        color: !form.repo || (requiresToken && !form.token) ? "var(--muted)" : "var(--bg)",
                        borderColor: "var(--border2)",
                        fontFamily: "var(--font-mono)",
                        cursor: !form.repo || (requiresToken && !form.token) ? "not-allowed" : "pointer",
                    }}
                >
                    {loading && <Spinner />}
                    {loading ? "CONNECTING..." : "CONNECT REPO ->"}
                </button>
            </div>
        </div>
    );
}
