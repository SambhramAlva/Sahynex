import { useEffect, useState } from "react";
import { Cursor, Tag } from "../ui/Primitives";

function renderPatchLine(line, index) {
    let background = "transparent";
    let color = "var(--muted2)";

    if (line.startsWith("+")) {
        background = "rgba(0,255,163,.08)";
        color = "var(--accent)";
    } else if (line.startsWith("-")) {
        background = "rgba(255,95,95,.08)";
        color = "var(--accent3)";
    } else if (line.startsWith("@@")) {
        background = "rgba(123,173,255,.08)";
        color = "var(--accent2)";
    }

    return (
        <div key={`${index}-${line}`} style={{ background, color, padding: "0 8px", whiteSpace: "pre-wrap" }}>
            {line || " "}
        </div>
    );
}

export default function ReviewPage({ runs = [], onDecision, onLoadRunChanges, errorMessage }) {
    const candidates = runs.filter((run) => run.status === "awaiting_approval" || run.status === "review");
    const [selectedId, setSelectedId] = useState(candidates[0]?.id || null);
    const [changedFiles, setChangedFiles] = useState([]);
    const [changesError, setChangesError] = useState("");
    const selected = candidates.find((run) => run.id === selectedId) || candidates[0] || null;

    useEffect(() => {
        if (!selected?.id || !onLoadRunChanges) {
            setChangedFiles([]);
            return;
        }

        let cancelled = false;
        setChangesError("");

        const loadChanges = async () => {
            try {
                const files = await onLoadRunChanges(selected.id);
                if (!cancelled) {
                    setChangedFiles(Array.isArray(files) ? files : []);
                }
            } catch (error) {
                if (!cancelled) {
                    setChangedFiles([]);
                    setChangesError(error?.message || "Failed to load changed files");
                }
            }
        };

        loadChanges();
        return () => {
            cancelled = true;
        };
    }, [selected?.id, onLoadRunChanges]);

    return (
        <div className="p-4 md:p-8">
            <div className="animate-fadeUp mb-6">
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Review Panel <Cursor /></div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>// pull requests awaiting your approval</div>
            </div>

            {candidates.length === 0 && (
                <div className="animate-fadeUp rounded-lg border p-5" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                    <div style={{ fontSize: 12, color: "var(--muted2)" }}>No runs are waiting for approval yet. New issues are queued automatically and will appear here when a PR preview is ready.</div>
                </div>
            )}

            {candidates.length > 0 && (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr]">
                    <div className="animate-fadeUp delay-1 rounded-lg border" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                        {candidates.map((pr) => (
                            <div
                                key={pr.id}
                                onClick={() => setSelectedId(pr.id)}
                                style={{
                                    padding: "14px 16px",
                                    borderBottom: "1px solid var(--border)",
                                    cursor: "pointer",
                                    background: selected?.id === pr.id ? "var(--bg3)" : "transparent",
                                    borderLeft: selected?.id === pr.id ? "2px solid var(--accent)" : "2px solid transparent",
                                }}
                            >
                                <div style={{ fontSize: 11, marginBottom: 5 }}>
                                    <span style={{ color: "var(--muted)" }}>Run {pr.id.slice(0, 6)}</span> #{pr.issue_number}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Tag color={pr.status === "awaiting_approval" ? "yellow" : "accent"}>{pr.status}</Tag>
                                    <span style={{ fontSize: 9, color: "var(--muted)" }}>PR #{pr.pr_number || "-"}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="animate-fadeUp delay-2 rounded-lg border" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
                        <div className="border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>PR #{selected.pr_number}: {selected.issue_title}</div>
                            <div className="flex items-center gap-2">
                                <code style={{ fontSize: 9, color: "var(--muted)" }}>{selected.branch_name}</code>
                                <span style={{ fontSize: 9, color: "var(--muted)" }}>to main</span>
                            </div>
                        </div>
                        <div className="border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                            <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: ".1em", marginBottom: 8 }}>PR LINK</div>
                            <a href={selected.pr_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--accent2)" }}>
                                {selected.pr_url}
                            </a>
                        </div>
                        <div className="px-5 py-4">
                            <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: ".1em", marginBottom: 8 }}>AI REVIEW SUMMARY</div>
                            <div className="rounded-md border-l-2 p-3 text-xs" style={{ background: "var(--bg3)", borderLeftColor: "var(--accent)", lineHeight: 1.7 }}>
                                {selected.review_summary || "No review summary available yet."}
                            </div>
                            <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: ".1em", marginBottom: 8, marginTop: 16 }}>CHANGED FILES</div>
                            {changesError && (
                                <div className="mb-3 rounded border px-3 py-2" style={{ borderColor: "var(--accent3)", background: "rgba(255,95,95,.08)", color: "var(--accent3)", fontSize: 11 }}>
                                    {changesError}
                                </div>
                            )}
                            {changedFiles.length === 0 && !changesError && (
                                <div className="rounded border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--muted2)" }}>
                                    No file diff is available for this PR yet.
                                </div>
                            )}
                            {changedFiles.map((file) => (
                                <div key={file.filename} className="mb-4 overflow-hidden rounded-md border" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                                    <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--border)", fontSize: 10 }}>
                                        <span style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{file.filename}</span>
                                        <span style={{ color: "var(--muted)" }}>
                                            {file.status}  +{file.additions}  -{file.deletions}
                                        </span>
                                    </div>
                                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1.7, maxHeight: 280, overflow: "auto" }}>
                                        {(file.patch || "Patch unavailable for this file.").split("\n").map(renderPatchLine)}
                                    </div>
                                </div>
                            ))}
                            {errorMessage && (
                                <div className="mt-3 rounded border px-3 py-2" style={{ borderColor: "var(--accent3)", background: "rgba(255,95,95,.08)", color: "var(--accent3)", fontSize: 11 }}>
                                    Agent error: {errorMessage}
                                </div>
                            )}
                            <div className="mt-4 flex gap-2">
                                <button
                                    onClick={async () => {
                                        try {
                                            await onDecision?.(selected.id, true);
                                        } catch {
                                            // Error is surfaced from parent state.
                                        }
                                    }}
                                    className="rounded px-3 py-2"
                                    style={{ background: "var(--accent)", color: "var(--bg)", border: "none", fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer" }}
                                >
                                    APPROVE AND MERGE
                                </button>
                                <button
                                    onClick={async () => {
                                        try {
                                            await onDecision?.(selected.id, false);
                                        } catch {
                                            // Error is surfaced from parent state.
                                        }
                                    }}
                                    className="rounded border px-3 py-2"
                                    style={{ background: "transparent", color: "var(--accent3)", borderColor: "var(--accent3)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer" }}
                                >
                                    REJECT
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
