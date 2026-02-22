"use client";

import type { JobRecord, JobStage } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

const stages: Array<{ key: JobStage; title: string; desc: string }> = [
  { key: "queued", title: "入队", desc: "等待调度" },
  { key: "parsing", title: "解析", desc: "提取视频信息" },
  { key: "transcribing", title: "转写", desc: "字幕与正文" },
  { key: "summarizing", title: "总结", desc: "生成 Markdown" },
  { key: "completed", title: "完成", desc: "结果可用" }
];

const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), "img"],
  attributes: {
    ...(defaultSchema.attributes || {}),
    img: ["src", "alt", "title", "width", "height"]
  }
};

interface Props {
  job: JobRecord | null;
  pageMode?: boolean;
  compact?: boolean;
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

export function WorkBoard({ job, pageMode = false, compact = false }: Props): React.ReactNode {
  const [pane, setPane] = useState<Pane>("summary");
  const summaryMarkdown = useMemo(() => sanitizeSummaryMarkdown(job?.summaryMarkdown || ""), [job?.summaryMarkdown]);

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
    <section className={pageMode ? "workboard workboard-page" : "panel workboard"}>
      {!compact ? (
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

      <div className={compact ? "workboard-headbar" : ""}>
        {compact ? <h4 className="workboard-head-title">阅读面板</h4> : null}
        <div className="pane-switch">
          <button className={pane === "raw" ? "on" : ""} onClick={() => setPane("raw")}>原文</button>
          <button className={pane === "summary" ? "on" : ""} onClick={() => setPane("summary")}>摘要</button>
          <button className={pane === "snapshots" ? "on" : ""} onClick={() => setPane("snapshots")}>快照</button>
        </div>
      </div>

      <article className="lane lane-single active">
        {pane === "raw" ? (
          <>
            <h3>原文</h3>
            <p className="lane-hint">转写文本与解析详情</p>
            {job?.transcriptText ? <pre>{job.transcriptText}</pre> : <p className="muted">暂无原文</p>}
          </>
        ) : null}

        {pane === "summary" ? (
          <>
            <h3>摘要</h3>
            <p className="lane-hint">Markdown 输出</p>
            {summaryMarkdown ? (
              <div className="markdown-body">
                <ReactMarkdown rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}>{summaryMarkdown}</ReactMarkdown>
              </div>
            ) : (
              <p className="muted">暂无摘要</p>
            )}
          </>
        ) : null}

        {pane === "snapshots" ? (
          <>
            <h3>快照</h3>
            <p className="lane-hint">可点击放大查看</p>
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
