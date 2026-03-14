import { useState } from "react";
import { Input, Spinner } from "../ui/Primitives";

export default function RepoSetup({ user, onSetup }) {
    const [form, setForm] = useState({ repo: "", token: "" });
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

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
            <div className="animate-fadeUp w-full max-w-[500px] rounded-xl border p-9" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
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

                <Input
                    label="GITHUB PERSONAL ACCESS TOKEN"
                    type="password"
                    value={form.token}
                    onChange={(v) => setForm((p) => ({ ...p, token: v }))}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                />

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
                    disabled={loading || !form.repo || !form.token}
                    className="flex w-full items-center justify-center gap-2 rounded-md border py-3 text-xs font-bold tracking-[.08em]"
                    style={{
                        background: !form.repo || !form.token ? "var(--bg4)" : "var(--accent)",
                        color: !form.repo || !form.token ? "var(--muted)" : "var(--bg)",
                        borderColor: "var(--border2)",
                        fontFamily: "var(--font-mono)",
                        cursor: !form.repo || !form.token ? "not-allowed" : "pointer",
                    }}
                >
                    {loading && <Spinner />}
                    {loading ? "CONNECTING..." : "CONNECT REPO ->"}
                </button>
            </div>
        </div>
    );
}
