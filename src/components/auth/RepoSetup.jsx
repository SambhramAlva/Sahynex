import { useState } from "react";
import { Input, Spinner, Tag } from "../ui/Primitives";

export default function RepoSetup({ onSetup }) {
    const [form, setForm] = useState({ repo: "", token: "" });
    const [loading, setLoading] = useState(false);

    const submit = () => {
        if (!form.repo || !form.token) return;
        setLoading(true);
        setTimeout(() => {
            setLoading(false);
            onSetup(form);
        }, 1400);
    };

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <div className="animate-fadeUp w-full max-w-[500px] rounded-xl border p-9" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Connect Repository</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 28 }}>// link your GitHub repo to get started</div>

                <Input
                    label="GITHUB REPO URL"
                    value={form.repo}
                    onChange={(v) => setForm((p) => ({ ...p, repo: v }))}
                    placeholder="https://github.com/user/repository"
                />
                <Input
                    label="GITHUB ACCESS TOKEN"
                    value={form.token}
                    onChange={(v) => setForm((p) => ({ ...p, token: v }))}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    type="password"
                />

                <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 20, lineHeight: 1.6 }}>
                    Needs: <Tag>repo</Tag> <Tag>pull_request</Tag> <Tag>issues</Tag> scopes
                </div>

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
