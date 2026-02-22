import type { JobRecord } from "@/lib/types";

const stageText: Record<string, string> = {
  queued: "等待队列",
  parsing: "解析视频",
  transcribing: "转写字幕",
  summarizing: "AI 总结",
  completed: "完成",
  failed: "失败"
};

interface Props {
  job: JobRecord | null;
}

export function StatusPanel({ job }: Props): React.ReactNode {
  if (!job) {
    return (
      <section className="panel status-panel">
        <h2 className="panel-title">状态</h2>
        <p className="muted">尚未开始任务。</p>
      </section>
    );
  }

  const stages = ["queued", "parsing", "transcribing", "summarizing", "completed"];
  const idx = stages.indexOf(job.stage);
  const progress = idx >= 0 ? ((idx + 1) / stages.length) * 100 : 100;

  return (
    <section className="panel status-panel">
      <h2 className="panel-title">状态</h2>
      <p className="status-current">
        当前阶段：<strong>{stageText[job.stage] ?? job.stage}</strong>
      </p>
      <div className="progress-shell">
        <div className="progress-bar" style={{ width: `${progress}%` }} />
      </div>
      {job.error ? <p className="error-text">{job.error}</p> : null}
      {job.warnings?.length ? (
        <div className="warn-box">
          {job.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

