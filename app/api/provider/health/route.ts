import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface HealthPayload {
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface AttemptResult {
  endpoint: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  error?: string;
  preview?: string;
}

interface ModelsResult {
  ok: boolean;
  status: number;
  models: string[];
  error?: string;
}

function stripLastSlash(input: string): string {
  return input.trim().replace(/\/+$/, "");
}

async function probe(endpoint: string, apiKey: string, model: string): Promise<AttemptResult> {
  const started = Date.now();
  try {
    const signal = AbortSignal.timeout(15000);
    const resp = await fetch(endpoint, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 16,
        messages: [
          { role: "system", content: "You are a strict health checker." },
          { role: "user", content: "reply only pong" }
        ]
      })
    });

    const latencyMs = Date.now() - started;
    const text = await resp.text();
    const contentType = (resp.headers.get("content-type") || "").toLowerCase();

    if (!resp.ok) {
      return {
        endpoint,
        ok: false,
        status: resp.status,
        latencyMs,
        error: `HTTP ${resp.status}`,
        preview: text.slice(0, 180)
      };
    }

    if (!contentType.includes("application/json")) {
      return {
        endpoint,
        ok: false,
        status: resp.status,
        latencyMs,
        error: "返回不是 JSON，通常是网关路径错误（例如缺少 /v1）",
        preview: text.slice(0, 180)
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        endpoint,
        ok: false,
        status: resp.status,
        latencyMs,
        error: "JSON 解析失败，返回内容不符合 OpenAI 兼容格式",
        preview: text.slice(0, 180)
      };
    }

    const content =
      typeof parsed === "object" && parsed
        ? (parsed as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content?.trim() || ""
        : "";

    if (!content) {
      return {
        endpoint,
        ok: false,
        status: resp.status,
        latencyMs,
        error: "缺少 choices[0].message.content，非有效 chat/completions 响应",
        preview: text.slice(0, 180)
      };
    }

    return {
      endpoint,
      ok: true,
      status: resp.status,
      latencyMs,
      preview: content.slice(0, 180)
    };
  } catch (error) {
    return {
      endpoint,
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function fetchModels(baseUrl: string, apiKey: string): Promise<ModelsResult> {
  const endpoint = `${baseUrl}/models`;
  try {
    const signal = AbortSignal.timeout(15000);
    const resp = await fetch(endpoint, {
      method: "GET",
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });
    const text = await resp.text();
    const contentType = (resp.headers.get("content-type") || "").toLowerCase();
    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        models: [],
        error: `模型列表请求失败: HTTP ${resp.status}`
      };
    }
    if (!contentType.includes("application/json")) {
      return {
        ok: false,
        status: resp.status,
        models: [],
        error: "模型列表返回非 JSON"
      };
    }
    const parsed = JSON.parse(text) as { data?: Array<{ id?: string }> };
    const models = (parsed.data || [])
      .map((x) => (typeof x.id === "string" ? x.id.trim() : ""))
      .filter(Boolean);
    return {
      ok: true,
      status: resp.status,
      models
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      models: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Partial<HealthPayload>;
    if (!body.baseUrl || !body.apiKey || !body.model) {
      return NextResponse.json({ ok: false, error: "baseUrl / apiKey / model 为必填项" }, { status: 400 });
    }

    const resolvedBaseUrl = stripLastSlash(body.baseUrl);
    const endpoint = `${resolvedBaseUrl}/chat/completions`;
    const attempt = await probe(endpoint, body.apiKey, body.model);
    const modelsResult = attempt.ok
      ? await fetchModels(resolvedBaseUrl, body.apiKey)
      : { ok: false, status: 0, models: [] as string[] };

    return NextResponse.json({
      ok: attempt.ok,
      status: attempt.status,
      latencyMs: attempt.latencyMs,
      preview: attempt.preview,
      error: attempt.error,
      usedEndpoint: attempt.endpoint,
      resolvedBaseUrl,
      attempts: [attempt],
      models: modelsResult.models,
      modelsStatus: modelsResult.status,
      modelsError: modelsResult.error
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

