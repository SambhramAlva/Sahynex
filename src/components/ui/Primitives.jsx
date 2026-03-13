export function Cursor() {
    return (
        <span className="animate-blink" style={{ color: "var(--accent)" }}>
            |
        </span>
    );
}

export function Tag({ color = "accent", children }) {
    const colors = {
        accent: "var(--accent)",
        blue: "var(--accent2)",
        red: "var(--accent3)",
        yellow: "var(--accent4)",
        muted: "var(--muted2)",
    };

    return (
        <span
            style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                letterSpacing: ".08em",
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 3,
                textTransform: "uppercase",
                border: `1px solid ${colors[color]}33`,
                color: colors[color],
                background: `${colors[color]}12`,
            }}
        >
            {children}
        </span>
    );
}

export function Badge({ n }) {
    return (
        <span
            style={{
                background: "var(--accent3)",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                borderRadius: 9,
                minWidth: 18,
                height: 18,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 5px",
                marginLeft: 6,
            }}
        >
            {n}
        </span>
    );
}

export function Spinner() {
    return (
        <svg className="animate-spin" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="var(--border2)" strokeWidth="2" />
            <path d="M8 2 A6 6 0 0 1 14 8" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export function Input({ label, value, onChange, placeholder, type = "text" }) {
    return (
        <div style={{ marginBottom: 16 }}>
            <label
                style={{
                    fontSize: 10,
                    color: "var(--muted)",
                    letterSpacing: ".1em",
                    display: "block",
                    marginBottom: 5,
                }}
            >
                {label}
            </label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-md border px-3 py-2 text-xs outline-none"
                style={{
                    background: "var(--bg3)",
                    borderColor: "var(--border)",
                    color: "var(--text)",
                    fontFamily: "var(--font-mono)",
                }}
            />
        </div>
    );
}

export function IssueStateDot({ state }) {
    const map = {
        open: "var(--accent2)",
        solving: "var(--accent)",
        review: "var(--accent4)",
        merged: "var(--muted2)",
        closed: "var(--accent3)",
    };

    return (
        <div
            style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: map[state] || "var(--muted)",
                flexShrink: 0,
            }}
        />
    );
}
