import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { buildSystemPrompt } from "@/lib/templates";
import type { AdapterResponse, JobInput, JobRecord, JobStage } from "@/lib/types";

function getAdapterBaseUrl(): string {
  return process.env.ADAPTER_BASE_URL || process.env.NEXT_PUBLIC_ADAPTER_BASE_URL || "http://127.0.0.1:8000";
}

function toRecord(row: Record<string, unknown>): JobRecord {
  return {
    id: String(row.id),
    title: row.title_text ? String(row.title_text) : undefined,
    status: row.status as JobRecord["status"],
    stage: row.stage as JobStage,
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : undefined,
    input: JSON.parse(String(row.input_json)) as JobInput,
    transcriptText: row.transcript_text ? String(row.transcript_text) : undefined,
    rawParseText: row.raw_parse_text ? String(row.raw_parse_text) : undefined,
    summaryMarkdown: row.summary_markdown ? String(row.summary_markdown) : undefined,
    snapshots: row.snapshots_json ? (JSON.parse(String(row.snapshots_json)) as string[]) : undefined,
    warnings: row.warnings_json ? (JSON.parse(String(row.warnings_json)) as string[]) : undefined,
    error: row.error ? String(row.error) : undefined
  };
}

function saveJob(job: JobRecord): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO jobs (
      id, title_text, status, stage, started_at, finished_at, input_json,
      transcript_text, raw_parse_text, summary_markdown, snapshots_json, warnings_json, error
    ) VALUES (
      @id, @titleText, @status, @stage, @startedAt, @finishedAt, @inputJson,
      @transcriptText, @rawParseText, @summaryMarkdown, @snapshotsJson, @warningsJson, @error
    )
    ON CONFLICT(id) DO UPDATE SET
      title_text=excluded.title_text,
      status=excluded.status,
      stage=excluded.stage,
      finished_at=excluded.finished_at,
      transcript_text=excluded.transcript_text,
      raw_parse_text=excluded.raw_parse_text,
      summary_markdown=excluded.summary_markdown,
      snapshots_json=excluded.snapshots_json,
      warnings_json=excluded.warnings_json,
      error=excluded.error`
  ).run({
    id: job.id,
    titleText: job.title ?? null,
    status: job.status,
    stage: job.stage,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt ?? null,
    inputJson: JSON.stringify(job.input),
    transcriptText: job.transcriptText ?? null,
    rawParseText: job.rawParseText ?? null,
    summaryMarkdown: job.summaryMarkdown ?? null,
    snapshotsJson: JSON.stringify(job.snapshots ?? []),
    warningsJson: JSON.stringify(job.warnings ?? []),
    error: job.error ?? null
  });
}

function sanitizeTitle(input: string): string {
  return input
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function fallbackTitle(summaryMarkdown: string, rawParseText: string): string {
  const heading = summaryMarkdown
    .split(/\n+/)
    .map((x) => x.trim())
    .find((x) => x.startsWith("#") || x.length > 8);
  if (heading) {
    const clean = sanitizeTitle(heading.replace(/^#+\s*/, "").replace(/[*_`]/g, ""));
    if (clean) return clean;
  }
  const first = rawParseText.split(/\n+/).map((x) => x.trim()).find(Boolean) || "视频摘要";
  return sanitizeTitle(first.replace(/<[^>]+>/g, "")) || "视频摘要";
}

function updateStage(job: JobRecord, stage: JobStage): void {
  job.stage = stage;
  saveJob(job);
}

function extractImgSrcs(input: string): string[] {
  const out: string[] = [];
  const reg = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = reg.exec(input)) !== null) out.push(m[1]);
  return out;
}

function replaceImgSrcs(input: string, transform: (src: string) => string): string {
  return input.replace(/(<img[^>]*src=["'])([^"']+)(["'][^>]*>)/gi, (_m, prefix: string, src: string, suffix: string) => {
    return `${prefix}${transform(src)}${suffix}`;
  });
}

function fileUriToPath(uri: string): string {
  const normalized = uri.replace("file:///", "").replace("file://", "");
  return decodeURIComponent(normalized).replace(/\//g, path.sep);
}

function toPublicSnapshotUrl(src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  if (/^file:\/\//i.test(src)) {
    const abs = path.resolve(fileUriToPath(src));
    return `/api/assets?path=${encodeURIComponent(abs)}`;
  }
  const abs = path.resolve(src);
  if (existsSync(abs)) {
    return `/api/assets?path=${encodeURIComponent(abs)}`;
  }
  return src;
}

async function callAdapter(input: JobInput): Promise<AdapterResponse> {
  const endpoint = input.platform === "youtube" ? "/parse/youtube" : "/parse/bilibili";
  const signal = AbortSignal.timeout(240_000);
  const res = await fetch(`${getAdapterBaseUrl()}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      url: input.url,
      lang: input.parseOptions.lang,
      comment_num: input.parseOptions.commentNum ?? 0,
      danmaku_num: input.parseOptions.danmakuNum ?? 0,
      snapshots: input.parseOptions.snapshots ?? "",
      need_subs: input.parseOptions.needSubs ?? true,
      need_pbp: input.parseOptions.needPbp ?? true
    })
  });
  if (!res.ok) {
    throw new Error(`解析服务失败: HTTP ${res.status}, ${await res.text()}`);
  }
  return (await res.json()) as AdapterResponse;
}

function buildFallbackSummary(transcriptText: string, rawParseText: string): string {
  const source = (transcriptText || rawParseText || "").replace(/\s+/g, " ").trim();
  const short = source.slice(0, 1200);
  const picks = short.split(/(?<=[。！？?!])\s+/).filter(Boolean).slice(0, 6);
  return [
    "## 摘要（本地兜底）",
    "new api 返回异常，已使用本地规则生成简版摘要。",
    "",
    "## 核心要点",
    ...(picks.length ? picks.map((x) => `- ${x}`) : ["- 未提取到有效文本。"]),
    "",
    "## 建议",
    "- 检查 new api 网关是否返回 OpenAI 兼容 JSON。",
    "- 如继续异常，可切换模型或网关地址。"
  ].join("\n");
}

async function callNewApi(input: JobInput, transcriptText: string, rawParseText: string): Promise<string> {
  const system = buildSystemPrompt(input.templateId, input.customSystemPrompt);
  const base = input.modelConfig.baseUrl.replace(/\/$/, "");
  const signal = AbortSignal.timeout(180_000);
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.modelConfig.apiKey}`
    },
    body: JSON.stringify({
      model: input.modelConfig.model,
      temperature: input.modelConfig.temperature ?? 0.4,
      max_tokens: input.modelConfig.maxTokens ?? 2200,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `请根据以下视频内容生成 Markdown 总结。\n\n【转写文本】\n${transcriptText || "（无）"}\n\n【原始解析文本】\n${rawParseText || "（无）"}`
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`new api 调用失败: HTTP ${response.status}, ${await response.text()}`);
  }

  const raw = await response.text();
  try {
    const payload = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("empty");
    return content;
  } catch {
    const trimmed = raw.trim();
    if (trimmed && !trimmed.startsWith("<!doctype") && !trimmed.startsWith("<html")) return trimmed;
    return buildFallbackSummary(transcriptText, rawParseText);
  }
}

async function callTitleApi(input: JobInput, summaryMarkdown: string): Promise<string> {
  const base = input.modelConfig.baseUrl.replace(/\/$/, "");
  const signal = AbortSignal.timeout(45_000);
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.modelConfig.apiKey}`
    },
    body: JSON.stringify({
      model: input.modelConfig.model,
      temperature: 0.2,
      max_tokens: 40,
      messages: [
        { role: "system", content: "你是标题助手。只输出一个中文标题，不要解释。20字以内。" },
        { role: "user", content: `根据以下摘要取标题：\n${summaryMarkdown}` }
      ]
    })
  });
  if (!response.ok) throw new Error(`title api failed: ${response.status}`);
  const raw = await response.text();
  try {
    const payload = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content || "";
    const title = sanitizeTitle(content.split("\n")[0] || "");
    if (title) return title;
  } catch {
    const title = sanitizeTitle(raw.split("\n")[0] || "");
    if (title) return title;
  }
  throw new Error("empty title");
}

async function runJob(id: string): Promise<void> {
  const current = await getJob(id);
  if (!current) return;

  try {
    updateStage(current, "parsing");
    const adapter = await callAdapter(current.input);
    current.rawParseText = adapter.rawText;
    current.transcriptText = adapter.transcriptText;

    const fromHtml = extractImgSrcs(adapter.rawText);
    const fromField = (adapter.snapshotHtmlTags || []).flatMap((tag) => extractImgSrcs(tag));
    const merged = [...new Set([...fromHtml, ...fromField].map((x) => toPublicSnapshotUrl(x)))];
    current.rawParseText = replaceImgSrcs(current.rawParseText || "", toPublicSnapshotUrl);
    current.snapshots = merged;
    current.warnings = adapter.warnings || [];
    saveJob(current);

    updateStage(current, "transcribing");
    updateStage(current, "summarizing");

    current.summaryMarkdown = await callNewApi(current.input, current.transcriptText || "", current.rawParseText || "");
    try {
      current.title = await callTitleApi(current.input, current.summaryMarkdown);
    } catch {
      current.title = fallbackTitle(current.summaryMarkdown, current.rawParseText || "");
    }
    current.status = "completed";
    current.stage = "completed";
    current.finishedAt = new Date().toISOString();
    saveJob(current);
  } catch (error) {
    current.status = "failed";
    current.stage = "failed";
    current.error = error instanceof Error ? error.message : String(error);
    current.finishedAt = new Date().toISOString();
    saveJob(current);
  }
}

export async function createJob(input: JobInput): Promise<JobRecord> {
  const rec: JobRecord = {
    id: randomUUID(),
    status: "running",
    stage: "queued",
    startedAt: new Date().toISOString(),
    input
  };
  saveJob(rec);
  setTimeout(() => {
    void runJob(rec.id);
  }, 0);
  return rec;
}

export async function getJob(id: string): Promise<JobRecord | undefined> {
  const db = getDb();
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? toRecord(row) : undefined;
}

export async function listJobs(limit = 40): Promise<JobRecord[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM jobs ORDER BY started_at DESC LIMIT ?")
    .all(Math.max(1, Math.min(limit, 200))) as Array<Record<string, unknown>>;
  return rows.map(toRecord);
}

