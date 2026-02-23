"use client";

import type { JobRecord, JobStage } from "@/lib/types";
import { markdownSchema } from "@/lib/markdownSchema";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

const stages: Array<{ key: JobStage; title: string; desc: string }> = [
  { key: "queued", title: "入队", desc: "等待调度" },
  { key: "parsing", title: "解析", desc: "提取视频信息" },
  { key: "transcribing", title: "转写", desc: "字幕与正文" },
  { key: "summarizing", title: "总结", desc: "生成 Markdown" },
  { key: "completed", title: "完成", desc: "结果可用" }
];

interface Props {
  job: JobRecord | null;
  pageMode?: boolean;
  compact?: boolean;
  showTimeline?: boolean;
  switchAlign?: "left" | "right";
  topLeft?: React.ReactNode;
}

type Pane = "raw" | "summary" | "snapshots";

function sanitizeSummaryMarkdown(md: string): string {
  return md
    .replace(/<img[\s\S]*?>/gi, (tag: string) => (tag.includes("file://") ? "" : tag))
    .replace(/file:\/\/\/?([^\s"')>]+)/gi, (_, p1: string) => `/api/assets?path=${encodeURIComponent(decodeURIComponent(String(p1).replace(/\//g, "\\")))}`)
    .replace(/<img([^>]*?)src=["']file:\/\/\/?([^"']+)["']([^>]*)>/gi, (_m: string, a: string, p: string, c: string) => {
      const normalized = decodeURIComponent(String(p)).replace(/\//g, "\\");
      const src = `/api/assets?path=${encodeURIComponent(normalized)}`;
      return `<img${a}src="${src}"${c}>`;
    });
}

export function WorkBoard({
  job,
  pageMode = false,
  compact = false,
  showTimeline = true,
  switchAlign = "left",
  topLeft
}: Props): React.ReactNode {
  const [pane, setPane] = useState<Pane>("summary");
  const summaryMarkdown = useMemo(() => sanitizeSummaryMarkdown(job?.summaryMarkdown || ""), [job?.summaryMarkdown]);
  const summaryTextOnly = useMemo(
    () =>
      summaryMarkdown
        .replace(/!\[[^\]]*]\([^)]+\)/g, "")
        .replace(/<img[\s\S]*?>/gi, ""),
    [summaryMarkdown]
  );

  const activeIndex = useMemo(() => {
    if (!job) return 0;
    const idx = stages.findIndex((x) => x.key === job.stage);
    return idx < 0 ? 0 : idx;
  }, [job]);

  useEffect(() => {
    if (!job) return;
    if (job.stage === "parsing" || job.stage === "transcribing") setPane("raw");
    if (job.stage === "summarizing") setPane("summary");
    if (job.stage === "completed") setPane("summary");
  }, [job]);

  return (
    <section
      className={`${pageMode ? "workboard workboard-page" : `panel workboard ${compact ? "compact" : ""}`} ${showTimeline ? "" : "no-timeline"}`.trim()}
    >
      {showTimeline && !compact ? (
        <div className="timeline">
          {stages.map((item, i) => {
            const done = i <= activeIndex;
            return (
              <div key={item.key} className={`node ${done ? "done" : ""}`}>
                <button className="node-dot" />
                <div className="node-meta">
                  <strong>{item.title}</strong>
                  <span>{item.desc}</span>
                </div>
              </div>
            );
          })}
          <div className="timeline-bar">
            <div className="timeline-fill" style={{ width: `${(activeIndex / (stages.length - 1)) * 100}%` }} />
          </div>
        </div>
      ) : null}

      <div className={`workboard-headbar ${switchAlign === "right" ? "switch-right" : ""}`}>
        <div className="workboard-head-left">{topLeft}</div>
        {compact && switchAlign !== "right" ? <h4 className="workboard-head-title">阅读面板</h4> : null}
        <div className="workboard-head-right">
          <div className="pane-switch">
            <button className={pane === "raw" ? "on" : ""} onClick={() => setPane("raw")}>原文</button>
            <button className={pane === "summary" ? "on" : ""} onClick={() => setPane("summary")}>摘要</button>
            <button className={pane === "snapshots" ? "on" : ""} onClick={() => setPane("snapshots")}>快照</button>
          </div>
        </div>
      </div>

      <article className="lane lane-single active">
        {pane === "raw" ? (
          <>
            {job?.transcriptText ? <pre>{job.transcriptText}</pre> : <p className="muted">暂无原文</p>}
          </>
        ) : null}

        {pane === "summary" ? (
          <>
            {summaryTextOnly ? (
              <div className="markdown-body">
                <ReactMarkdown rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSchema]]}>{summaryTextOnly}</ReactMarkdown>
              </div>
            ) : (
              <p className="muted">暂无摘要</p>
            )}
          </>
        ) : null}

        {pane === "snapshots" ? (
          <>
            <div className="snap-grid">
              {job?.snapshots?.length ? (
                job.snapshots.map((src) => <img key={src} src={src} alt="snapshot" loading="lazy" />)
              ) : (
                <p className="muted">暂无快照</p>
              )}
            </div>
          </>
        ) : null}
      </article>

      {job?.error ? <p className="error-text">任务失败：{job.error}</p> : null}
    </section>
  );
}
