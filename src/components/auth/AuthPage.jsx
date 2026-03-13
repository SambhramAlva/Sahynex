import { useState } from "react";
import { Input, Spinner } from "../ui/Primitives";

export default function AuthPage({ onAuth }) {
    const [mode, setMode] = useState("login");
    const [form, setForm] = useState({ name: "", email: "", password: "" });
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const submit = () => {
        setErr("");
        if (!form.email || !form.password) {
            setErr("All fields required.");
            return;
        }
        if (mode === "signup" && !form.name) {
            setErr("Name required.");
            return;
        }
        setLoading(true);
        setTimeout(() => {
            setLoading(false);
            onAuth({ name: form.name || form.email.split("@")[0], email: form.email });
        }, 1200);
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
            <div className="animate-fadeUp z-10 w-full max-w-[440px] rounded-xl border p-9" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
                    {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                        <div key={c} style={{ width: 11, height: 11, borderRadius: "50%", background: c }} />
                    ))}
                </div>

                <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, marginBottom: 4 }}>
                    <span style={{ color: "var(--accent)" }}>git</span>agent
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 28, letterSpacing: ".06em" }}>
                    {mode === "login" ? "// authenticate to continue" : "// create your account"}
                </div>

                <div style={{ display: "flex", background: "var(--bg3)", borderRadius: 6, padding: 3, marginBottom: 24 }}>
                    {["login", "signup"].map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            style={{
                                flex: 1,
                                padding: "7px 0",
                                background: mode === m ? "var(--bg4)" : "transparent",
                                border: mode === m ? "1px solid var(--border2)" : "1px solid transparent",
                                borderRadius: 4,
                                color: mode === m ? "var(--text)" : "var(--muted)",
                                cursor: "pointer",
                                fontSize: 11,
                                fontFamily: "var(--font-mono)",
                                letterSpacing: ".05em",
                            }}
                        >
                            {m.toUpperCase()}
                        </button>
                    ))}
                </div>

                {mode === "signup" && (
                    <Input label="NAME" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} placeholder="your name" />
                )}
                <Input
                    label="EMAIL"
                    value={form.email}
                    onChange={(v) => setForm((p) => ({ ...p, email: v }))}
                    placeholder="you@example.com"
                    type="email"
                />
                <Input
                    label="PASSWORD"
                    value={form.password}
                    onChange={(v) => setForm((p) => ({ ...p, password: v }))}
                    placeholder="........"
                    type="password"
                />

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
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-md border-0 py-3 text-xs font-bold tracking-[.08em]"
                    style={{
                        background: "var(--accent)",
                        color: "var(--bg)",
                        fontFamily: "var(--font-mono)",
                        opacity: loading ? 0.7 : 1,
                        cursor: "pointer",
                    }}
                >
                    {loading && <Spinner />}
                    {loading ? "AUTHENTICATING..." : mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
                </button>
            </div>
        </div>
    );
}
