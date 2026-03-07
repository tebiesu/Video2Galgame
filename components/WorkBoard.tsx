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
      className={`animate-ios ${pageMode ? "workboard-page" : "ba-card"}`}
      style={{ padding: pageMode ? "0" : "24px" }}
    >
      <div className={`workboard-headbar ${switchAlign === "right" ? "switch-right" : ""}`} style={{ marginBottom: "20px" }}>
        <div className="workboard-head-left">{topLeft || <h3 className="ba-section-title" style={{ margin: 0 }}>任务看板</h3>}</div>
        <div className="workboard-head-right">
          <div className="ba-glass" style={{ display: "inline-flex", padding: "4px", borderRadius: "14px", gap: "4px" }}>
            <button 
              className="ba-button" 
              style={{ height: "32px", padding: "0 16px", fontSize: "13px", borderRadius: "10px", background: pane === "raw" ? "var(--ba-blue)" : "transparent", color: pane === "raw" ? "white" : "var(--ba-text-soft)" }}
              onClick={() => setPane("raw")}
            >
              原文
            </button>
            <button 
              className="ba-button" 
              style={{ height: "32px", padding: "0 16px", fontSize: "13px", borderRadius: "10px", background: pane === "summary" ? "var(--ba-blue)" : "transparent", color: pane === "summary" ? "white" : "var(--ba-text-soft)" }}
              onClick={() => setPane("summary")}
            >
              摘要
            </button>
            <button 
              className="ba-button" 
              style={{ height: "32px", padding: "0 16px", fontSize: "13px", borderRadius: "10px", background: pane === "snapshots" ? "var(--ba-blue)" : "transparent", color: pane === "snapshots" ? "white" : "var(--ba-text-soft)" }}
              onClick={() => setPane("snapshots")}
            >
              快照
            </button>
          </div>
        </div>
      </div>

      {showTimeline && !compact && (
        <div className="timeline ba-glass animate-ios" style={{ padding: "20px", borderRadius: "18px", marginBottom: "24px" }}>
          {stages.map((item, i) => {
            const done = i <= activeIndex;
            return (
              <div key={item.key} className={`node ${done ? "done" : ""}`}>
                <div 
                  className="animate-ios"
                  style={{ 
                    width: "12px", height: "12px", borderRadius: "50%", 
                    background: done ? "var(--ba-blue)" : "var(--ba-border)",
                    boxShadow: done ? "0 0 12px var(--ba-blue)" : "none"
                  }} 
                />
                <div className="node-meta" style={{ marginTop: "8px" }}>
                  <strong style={{ fontSize: "12px", color: done ? "var(--ba-blue)" : "var(--ba-text-soft)" }}>{item.title}</strong>
                </div>
              </div>
            );
          })}
          <div className="timeline-bar" style={{ background: "var(--ba-border)", top: "25px" }}>
            <div className="timeline-fill" style={{ width: `${(activeIndex / (stages.length - 1)) * 100}%`, background: "var(--ba-blue)" }} />
          </div>
        </div>
      )}

      <article className="animate-ios" style={{ minHeight: "400px" }}>
        {pane === "raw" ? (
          <div className="ba-glass" style={{ padding: "20px", borderRadius: "18px", fontSize: "14px", lineHeight: "1.8", whiteSpace: "pre-wrap", color: "var(--ba-text)" }}>
            {job?.transcriptText ? job.transcriptText : <p className="muted">暂无原文数据</p>}
          </div>
        ) : null}

        {pane === "summary" ? (
          <div className="markdown-body ba-glass animate-ios" style={{ padding: "24px", borderRadius: "18px" }}>
            {summaryTextOnly ? (
              <ReactMarkdown rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSchema]]}>
                {summaryTextOnly}
              </ReactMarkdown>
            ) : (
              <p className="muted">正在同步 SCHALE 总结报告...</p>
            )}
          </div>
        ) : null}

        {pane === "snapshots" ? (
          <div className="snap-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
            {job?.snapshots?.length ? (
              job.snapshots.map((src) => (
                <img 
                  key={src} src={src} alt="snapshot" 
                  className="animate-ios hover-lift"
                  style={{ width: "100%", borderRadius: "14px", border: "1px solid var(--ba-border)" }} 
                />
              ))
            ) : (
              <p className="muted">暂无视频快照</p>
            )}
          </div>
        ) : null}
      </article>

      {job?.error ? (
        <div className="ba-glass" style={{ marginTop: "20px", padding: "16px", borderRadius: "14px", border: "1px solid var(--ba-pink)", color: "var(--ba-pink)" }}>
          任务异常：{job.error}
        </div>
      ) : null}
    </section>
  );
}
