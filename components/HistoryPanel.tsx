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
    <aside className={`animate-ba ${className}`.trim()} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="history-head" style={{ marginBottom: "24px", padding: "0 8px" }}>
        <h3 className="ba-section-title" style={{ fontSize: "16px" }}>MOMOTALK ARCHIVES / 历史通讯</h3>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p className="muted" style={{ fontSize: "11px", fontWeight: "bold" }}>LAST SYNC: {new Date().toLocaleDateString()}</p>
          {onRefresh ? (
            <button className="ba-button" style={{ height: "28px", padding: "0 10px", fontSize: "10px", border: "1.5px solid var(--ba-blue)", boxShadow: "2px 2px 0 var(--ba-blue-light)" }} onClick={onRefresh}>
              REFRESH
            </button>
          ) : null}
        </div>
      </div>

      <div className="history-list" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", paddingRight: "8px" }}>
        {items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", background: "var(--ba-white)", borderRadius: "16px", border: "2px dashed var(--ba-border-color)" }}>
            <p className="muted" style={{ fontWeight: "bold" }}>NO MESSAGES FOUND</p>
          </div>
        ) : null}
        
        {items.map((job, index) => {
          const active = currentId === job.id;
          const statusColor = job.status === "completed" ? "#10B981" : job.status === "failed" ? "var(--ba-pink)" : "var(--ba-accent-yellow)";
          
          return (
            <button
              key={job.id}
              className={`animate-ba delay-${Math.min(index + 1, 3)}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                padding: "16px",
                borderRadius: "18px",
                border: active ? "2px solid var(--ba-blue)" : "1.5px solid transparent",
                background: active ? "var(--ba-blue-light)" : "var(--ba-white)",
                boxShadow: active ? "0 8px 20px rgba(0, 163, 255, 0.15)" : "0 4px 12px rgba(0,0,0,0.02)",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.3s var(--ios-ease)",
                width: "100%",
                position: "relative",
                overflow: "hidden"
              }}
              onClick={() => onPick(job.id)}
            >
              {/* 头像圈 */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: active ? "var(--ba-blue)" : "var(--ba-bg-base)", border: "2px solid white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", color: active ? "white" : "var(--ba-blue)", fontWeight: "900", boxShadow: "0 4px 10px rgba(0,0,0,0.05)" }}>
                  {job.input.platform === "youtube" ? "Y" : "B"}
                </div>
                {/* 状态指示点 */}
                <div style={{ position: "absolute", bottom: "2px", right: "2px", width: "12px", height: "12px", borderRadius: "50%", background: statusColor, border: "2px solid white", boxShadow: `0 0 8px ${statusColor}80` }} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "14px", fontWeight: "900", color: active ? "var(--ba-blue)" : "var(--ba-text-main)" }}>
                    {job.input.platform.toUpperCase()} MISSION
                  </span>
                  <span style={{ fontSize: "10px", color: "var(--ba-text-soft)", fontWeight: "800" }}>
                    {job.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--ba-text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: "2px" }}>
                  {pickTitle(job)}
                </div>
                <div style={{ fontSize: "11px", color: "var(--ba-text-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: 0.7 }}>
                  {job.input.url}
                </div>
              </div>

              {/* 装饰边条 */}
              {active && <div style={{ position: "absolute", left: 0, top: "20%", bottom: "20%", width: "4px", background: "var(--ba-blue)", borderRadius: "0 4px 4px 0" }} />}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

