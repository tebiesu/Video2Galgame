"use client";

import type { JobRecord } from "@/lib/types";

interface Props {
  items: JobRecord[];
  currentId?: string;
  onPick: (id: string) => void;
  onRefresh?: () => void;
}

export function HistoryPanel({ items, currentId, onPick, onRefresh }: Props): React.ReactNode {
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
    <aside className="panel history-panel">
      <div className="history-head">
        <h3 className="panel-subtitle">历史任务</h3>
        {onRefresh ? <button className="ghost-btn mini" onClick={onRefresh}>刷新</button> : null}
      </div>
      <p className="muted">可回看每次解析输入、状态和产出。</p>
      <div className="history-list">
        {items.length === 0 ? <p className="muted">暂无历史记录</p> : null}
        {items.map((job) => {
          const active = currentId === job.id;
          return (
            <button key={job.id} className={`history-item ${active ? "active" : ""}`} onClick={() => onPick(job.id)}>
              <span className="history-platform">{job.input.platform.toUpperCase()}</span>
              <strong className="history-title">{pickTitle(job)}</strong>
              <span className="history-url">{job.input.url}</span>
              <span className={`history-status state-${job.status}`}>{job.status}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

