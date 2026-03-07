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
      className={`animate-ba ${pageMode ? "workboard-page" : "ba-card"}`}
      style={{ padding: pageMode ? "0" : "40px", position: "relative" }}
    >
      {/* 背景装饰：机密水印 */}
      <div style={{ position: "absolute", top: "40px", right: "40px", opacity: 0.05, fontSize: "60px", fontWeight: "900", pointerEvents: "none", transform: "rotate(-15deg)" }}>
        TOP SECRET / 机密
      </div>

      <div className={`workboard-headbar ${switchAlign === "right" ? "switch-right" : ""}`} style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="workboard-head-left">
          {topLeft || (
            <div>
              <div className="ba-section-title">INTELLIGENCE REPORT / 情报报告</div>
              <h3 style={{ margin: 0, fontSize: "24px", fontWeight: "900" }}>任务执行分析</h3>
            </div>
          )}
        </div>
        <div className="workboard-head-right">
          <div style={{ display: "flex", background: "var(--ba-bg-base)", padding: "6px", borderRadius: "16px", gap: "8px", border: "2px solid var(--ba-blue-light)" }}>
            <button 
              className="ba-button" 
              style={{ height: "40px", border: "none", borderRadius: "10px", background: pane === "raw" ? "var(--ba-blue)" : "transparent", color: pane === "raw" ? "white" : "var(--ba-text-soft)", boxShadow: pane === "raw" ? "" : "none" }}
              onClick={() => setPane("raw")}
            >
              RAW DATA
            </button>
            <button 
              className="ba-button" 
              style={{ height: "40px", border: "none", borderRadius: "10px", background: pane === "summary" ? "var(--ba-blue)" : "transparent", color: pane === "summary" ? "white" : "var(--ba-text-soft)", boxShadow: pane === "summary" ? "" : "none" }}
              onClick={() => setPane("summary")}
            >
              SUMMARY
            </button>
            <button 
              className="ba-button" 
              style={{ height: "40px", border: "none", borderRadius: "10px", background: pane === "snapshots" ? "var(--ba-blue)" : "transparent", color: pane === "snapshots" ? "white" : "var(--ba-text-soft)", boxShadow: pane === "snapshots" ? "" : "none" }}
              onClick={() => setPane("snapshots")}
            >
              VISUALS
            </button>
          </div>
        </div>
      </div>

      {showTimeline && !compact && (
        <div className="timeline animate-ba delay-1" style={{ background: "rgba(0, 163, 255, 0.03)", padding: "30px", borderRadius: "20px", marginBottom: "40px", border: "1.5px solid var(--ba-blue-light)", position: "relative" }}>
          <div style={{ position: "absolute", top: "10px", left: "20px", fontSize: "10px", fontWeight: "900", color: "var(--ba-blue)", opacity: 0.5 }}>SEQUENCE EXECUTION PROGRESS</div>
          <div style={{ display: "flex", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
            {stages.map((item, i) => {
              const done = i <= activeIndex;
              return (
                <div key={item.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", width: "80px" }}>
                  <div 
                    style={{ 
                      width: "32px", height: "32px", borderRadius: "50%", 
                      background: done ? "var(--ba-blue)" : "white",
                      border: "3px solid " + (done ? "var(--ba-blue-light)" : "var(--ba-border-color)"),
                      boxShadow: done ? "0 0 15px var(--ba-blue-glow)" : "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: done ? "white" : "var(--ba-text-soft)", fontSize: "14px", fontWeight: "900"
                    }} 
                  >
                    {done ? "✓" : i + 1}
                  </div>
                  <strong style={{ fontSize: "11px", color: done ? "var(--ba-blue)" : "var(--ba-text-soft)", textAlign: "center" }}>{item.title}</strong>
                </div>
              );
            })}
          </div>
          {/* 背景连接线 */}
          <div style={{ position: "absolute", top: "46px", left: "60px", right: "60px", height: "4px", background: "var(--ba-border-color)", zIndex: 0 }}>
            <div style={{ height: "100%", width: `${(activeIndex / (stages.length - 1)) * 100}%`, background: "var(--ba-blue)", transition: "width 0.5s var(--ios-ease)" }} />
          </div>
        </div>
      )}

      <article className="animate-ba delay-2" style={{ minHeight: "500px" }}>
        {pane === "raw" ? (
          <div className="ba-card" style={{ padding: "30px", background: "#1E293B", color: "#94A3B8", borderRadius: "16px", border: "none", fontFamily: "'Fira Code', monospace", fontSize: "13px", lineHeight: "1.6", overflowY: "auto", maxHeight: "600px" }}>
            <div style={{ color: "#38BDF8", marginBottom: "10px", fontWeight: "bold", borderBottom: "1px solid #334155", paddingBottom: "8px" }}>// STREAM DATA FROM ADAPTER</div>
            {job?.transcriptText ? job.transcriptText : "NO TRANSCRIPT DATA FOUND."}
          </div>
        ) : null}

        {pane === "summary" ? (
          <div className="markdown-body ba-card animate-ba" style={{ padding: "40px", border: "2px solid var(--ba-blue-light)" }}>
            <div style={{ marginBottom: "20px", display: "flex", gap: "10px" }}>
              <span style={{ background: "var(--ba-blue)", color: "white", padding: "2px 10px", borderRadius: "4px", fontSize: "10px", fontWeight: "900" }}>FINAL_VERDICT</span>
              <span style={{ color: "var(--ba-blue)", fontWeight: "bold", fontSize: "12px" }}>SCHALE INTELLIGENCE UNIT</span>
            </div>
            {summaryTextOnly ? (
              <ReactMarkdown rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSchema]]}>
                {summaryTextOnly}
              </ReactMarkdown>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", padding: "100px 0" }}>
                <div style={{ width: "40px", height: "40px", border: "3px solid var(--ba-blue-light)", borderTopColor: "var(--ba-blue)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                <p className="muted" style={{ fontWeight: "900" }}>SYNCHRONIZING WITH ARONA...</p>
              </div>
            )}
          </div>
        ) : null}

        {pane === "snapshots" ? (
          <div className="snap-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "24px" }}>
            {job?.snapshots?.length ? (
              job.snapshots.map((src, idx) => (
                <div key={src} className="animate-ba" style={{ animationDelay: `${idx * 0.1}s` }}>
                  <div style={{ position: "relative", borderRadius: "16px", overflow: "hidden", border: "2px solid var(--ba-border-color)", boxShadow: "0 4px 15px rgba(0,0,0,0.05)" }}>
                    <img src={src} alt="snapshot" style={{ width: "100%", display: "block" }} />
                    <div style={{ position: "absolute", bottom: "0", left: "0", background: "rgba(0,0,0,0.6)", color: "white", padding: "4px 12px", fontSize: "10px", fontWeight: "bold" }}>
                      SNAPSHOT_ID_{idx.toString().padStart(3, '0')}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "100px", border: "2px dashed var(--ba-border-color)", borderRadius: "20px" }}>
                <p className="muted" style={{ fontWeight: "900" }}>NO VISUAL DATA CAPTURED</p>
              </div>
            )}
          </div>
        ) : null}
      </article>

      {job?.error ? (
        <div className="animate-ba" style={{ marginTop: "32px", padding: "24px", borderRadius: "16px", background: "rgba(255, 107, 157, 0.1)", border: "2.5px solid var(--ba-pink)", color: "var(--ba-pink)", fontWeight: "900", display: "flex", gap: "16px", alignItems: "center" }}>
          <span style={{ fontSize: "24px" }}>⚠</span>
          <div>
            <div style={{ fontSize: "12px", opacity: 0.8 }}>CRITICAL SYSTEM ERROR</div>
            {job.error}
          </div>
        </div>
      ) : null}
    </section>
  );
}
