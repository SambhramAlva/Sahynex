import { useState } from "react";
import { Input, Spinner } from "../ui/Primitives";

const RAW_API_BASE_URL = (import.meta.env.VITE_API_URL || "").trim();
const API_BASE_URL = (
    RAW_API_BASE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:8000")
).replace(/\/$/, "");

export default function AuthPage({ onAuth }) {
    const [mode, setMode] = useState("login");
    const [form, setForm] = useState({ name: "", email: "", password: "" });
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const submit = async () => {
        if (!form.email || !form.password || (mode === "signup" && !form.name.trim())) {
            return;
        }

        setErr("");
        setLoading(true);
        try {
            const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
            const payload = mode === "signup"
                ? { name: form.name.trim(), email: form.email.trim(), password: form.password }
                : { email: form.email.trim(), password: form.password };

            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                let detail = `Authentication failed (${response.status})`;
                try {
                    const data = await response.json();
                    if (data?.detail) {
                        detail = Array.isArray(data.detail)
                            ? data.detail.map((item) => item.msg || item).join(", ")
                            : data.detail;
                    }
                } catch {
                    // Keep fallback detail.
                }
                throw new Error(detail);
            }

            const authData = await response.json();
            await onAuth(authData);
        } catch (error) {
            setErr(error?.message || "Authentication failed.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
            <div className="animate-fadeUp z-10 w-full max-w-[440px] rounded-xl border p-5 sm:p-7 md:p-9" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
                    {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                        <div key={c} style={{ width: 11, height: 11, borderRadius: "50%", background: c }} />
                    ))}
                </div>

                <div style={{ fontFamily: "var(--font-display)", fontSize: "clamp(24px, 6vw, 28px)", fontWeight: 800, marginBottom: 4 }}>
                    <span style={{ color: "var(--accent)" }}>git</span>agent
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 28, letterSpacing: ".06em" }}>
                    {"// manual account login"}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                    <button
                        onClick={() => setMode("login")}
                        className="rounded-md border px-3 py-2 text-xs font-bold"
                        style={{
                            background: mode === "login" ? "var(--accent)" : "transparent",
                            color: mode === "login" ? "var(--bg)" : "var(--muted2)",
                            borderColor: "var(--border2)",
                            fontFamily: "var(--font-mono)",
                            cursor: "pointer",
                        }}
                    >
                        LOGIN
                    </button>
                    <button
                        onClick={() => setMode("signup")}
                        className="rounded-md border px-3 py-2 text-xs font-bold"
                        style={{
                            background: mode === "signup" ? "var(--accent)" : "transparent",
                            color: mode === "signup" ? "var(--bg)" : "var(--muted2)",
                            borderColor: "var(--border2)",
                            fontFamily: "var(--font-mono)",
                            cursor: "pointer",
                        }}
                    >
                        SIGN UP
                    </button>
                </div>

                {mode === "signup" && (
                    <Input
                        label="NAME"
                        value={form.name}
                        onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                        placeholder="Your name"
                    />
                )}

                <Input
                    label="EMAIL"
                    value={form.email}
                    onChange={(v) => setForm((p) => ({ ...p, email: v }))}
                    placeholder="you@example.com"
                />

                <Input
                    label="PASSWORD"
                    type="password"
                    value={form.password}
                    onChange={(v) => setForm((p) => ({ ...p, password: v }))}
                    placeholder="••••••••"
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
                    {loading ? "AUTHENTICATING..." : mode === "signup" ? "CREATE ACCOUNT ->" : "LOGIN ->"}
                </button>
            </div>
        </div>
    );
}
