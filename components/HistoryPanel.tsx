"use client";

import type { JobRecord } from "@/lib/types";

interface Props {
  items: JobRecord[];
  currentId?: string;
  onPick: (id: string) => void;
  onRefresh?: () => void;
  className?: string;
}

export function HistoryPanel({ items, currentId, onPick, onRefresh, className = "" }: Props): React.ReactNode {
  function pickTitle(job: JobRecord): string {
    if (job.title?.trim()) return job.title.trim();
    const fromMarkdown = (job.summaryMarkdown || "")
      .split(/\n+/)
      .map((x) => x.trim())
      .find((x) => x && !x.startsWith("![]("));
    if (fromMarkdown) {
      return fromMarkdown.replace(/^#+\s*/, "").replace(/[*_`]/g, "").slice(0, 40);
    }
    try {
      const u = new URL(job.input.url);
      return `${u.hostname}${u.pathname}`.slice(0, 40);
    } catch {
      return job.input.url.slice(0, 40);
    }
  }

  return (
    <aside className={`animate-ios ${className}`.trim()}>
      <div className="history-head" style={{ marginBottom: "20px" }}>
        <h3 className="ba-section-title">历史任务</h3>
        {onRefresh ? (
          <button className="ba-button" style={{ height: "32px", padding: "0 12px", fontSize: "12px", background: "var(--ba-blue-light)", color: "var(--ba-blue)" }} onClick={onRefresh}>
            🔄 刷新
          </button>
        ) : null}
      </div>
      <div className="history-list" style={{ display: "grid", gap: "12px" }}>
        {items.length === 0 ? <p className="muted" style={{ textAlign: "center", padding: "40px 0" }}>暂无任务记录</p> : null}
        {items.map((job) => {
          const active = currentId === job.id;
          return (
            <button
              key={job.id}
              className="animate-ios active-shrink"
              style={{
                display: "grid",
                textAlign: "left",
                padding: "16px",
                borderRadius: "18px",
                border: active ? "2px solid var(--ba-blue)" : "1px solid var(--ba-border)",
                background: active ? "var(--ba-white)" : "rgba(255,255,255,0.5)",
                boxShadow: active ? "0 8px 24px rgba(0, 163, 255, 0.15)" : "none",
                cursor: "pointer",
                position: "relative",
                overflow: "hidden"
              }}
              onClick={() => onPick(job.id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "10px", fontWeight: "800", color: "var(--ba-blue)", background: "var(--ba-blue-light)", padding: "2px 8px", borderRadius: "6px" }}>
                  {job.input.platform.toUpperCase()}
                </span>
                <span style={{ 
                  fontSize: "10px", 
                  padding: "2px 8px", 
                  borderRadius: "6px",
                  background: job.status === "completed" ? "#E6F9F1" : job.status === "failed" ? "#FFF0F3" : "#FFF9E6",
                  color: job.status === "completed" ? "#14865F" : job.status === "failed" ? "#C73B58" : "#8F6700"
                }}>
                  {job.status}
                </span>
              </div>
              <strong style={{ fontSize: "15px", color: "var(--ba-text)", marginBottom: "4px", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {pickTitle(job)}
              </strong>
              <span style={{ fontSize: "12px", color: "var(--ba-text-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: 0.7 }}>
                {job.input.url}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

