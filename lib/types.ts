export type Platform = "youtube" | "bilibili";

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ParseOptions {
  lang?: string;
  commentNum?: number;
  danmakuNum?: number;
  snapshots?: string;
  needSubs?: boolean;
  needPbp?: boolean;
}

export interface JobInput {
  platform: Platform;
  url: string;
  templateId: string;
  summaryMode?: "template" | "role";
  roleName?: string;
  customSystemPrompt: string;
  modelConfig: ModelConfig;
  parseOptions: ParseOptions;
}

export type JobStage =
  | "queued"
  | "parsing"
  | "transcribing"
  | "summarizing"
  | "completed"
  | "failed";

export interface JobRecord {
  id: string;
  title?: string;
  status: "running" | "completed" | "failed";
  stage: JobStage;
  startedAt: string;
  finishedAt?: string;
  input: JobInput;
  transcriptText?: string;
  rawParseText?: string;
  summaryMarkdown?: string;
  snapshots?: string[];
  warnings?: string[];
  error?: string;
}

export interface AdapterResponse {
  ok: boolean;
  platform: Platform;
  metadata?: Record<string, string>;
  transcriptText: string;
  rawText: string;
  snapshotHtmlTags: string[];
  warnings: string[];
}
