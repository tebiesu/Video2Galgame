"use client";

import type { JobRecord } from "@/lib/types";
import { markdownSchema } from "@/lib/markdownSchema";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

interface Props {
  job: JobRecord | null;
}

export function MarkdownResult({ job }: Props): React.ReactNode {
  return (
    <section className="ba-card result-panel">
      <h2 className="ba-section-title">输出结果</h2>
      {!job && <p className="muted">提交任务后会在这里展示 Markdown 结果。</p>}
      {job?.summaryMarkdown ? (
        <article className="markdown-body">
          <ReactMarkdown rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSchema]]}>
            {job.summaryMarkdown}
          </ReactMarkdown>
        </article>
      ) : null}

      {job?.rawParseText ? (
        <details className="raw-box">
          <summary>查看原始解析文本</summary>
          <pre>{job.rawParseText}</pre>
        </details>
      ) : null}
    </section>
  );
}

