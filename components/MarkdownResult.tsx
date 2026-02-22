"use client";

import type { JobRecord } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

interface Props {
  job: JobRecord | null;
}

const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), "img"],
  attributes: {
    ...(defaultSchema.attributes || {}),
    img: ["src", "alt", "title", "width", "height"]
  }
};

export function MarkdownResult({ job }: Props): React.ReactNode {
  return (
    <section className="panel result-panel">
      <h2 className="panel-title">输出结果</h2>
      {!job && <p className="muted">提交任务后会在这里展示 Markdown 结果。</p>}
      {job?.summaryMarkdown ? (
        <article className="markdown-body">
          <ReactMarkdown rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}>
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
