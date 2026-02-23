import { NextResponse } from "next/server";

export const runtime = "nodejs";

function toBaseUrl(input?: string): string {
  const raw = (input || "https://api.siliconflow.cn/v1").trim().replace(/\/+$/, "");
  return raw.replace("api.siliconflow.com", "api.siliconflow.cn");
}

function normalizeApiKey(input?: string): string {
  const text = (input || "").trim().replace(/^["']|["']$/g, "");
  return text.replace(/^Bearer\s+/i, "").trim();
}

export async function GET(request: Request): Promise<Response> {
  void request;
  return NextResponse.json(
    { error: "GET 已禁用，请改用 PUT 并在 JSON body 传入 baseUrl 与 apiKey。" },
    { status: 405 }
  );
}

export async function PUT(request: Request): Promise<Response> {
  let body: { baseUrl?: string; apiKey?: string };
  try {
    body = (await request.json()) as { baseUrl?: string; apiKey?: string };
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const baseUrl = toBaseUrl(body.baseUrl);
  const apiKey = normalizeApiKey(body.apiKey);
  if (!apiKey) return NextResponse.json({ error: "缺少 API Key" }, { status: 400 });

  const endpoint = `${baseUrl}/audio/voice/list`;
  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: "拉取音色列表失败", detail: `${endpoint} -> HTTP ${res.status}: ${text.slice(0, 280)}` },
      { status: 502 }
    );
  }
  return new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
}

export async function POST(request: Request): Promise<Response> {
  const incoming = await request.formData();
  const baseUrl = toBaseUrl(String(incoming.get("baseUrl") || ""));
  const apiKey = normalizeApiKey(String(incoming.get("apiKey") || ""));
  const model = String(incoming.get("model") || "FunAudioLLM/CosyVoice2-0.5B");
  const customName = String(incoming.get("customName") || "").trim();
  const text = String(incoming.get("text") || "").trim();
  const file = incoming.get("file");

  if (!apiKey) return NextResponse.json({ error: "缺少 API Key" }, { status: 400 });
  if (!customName || !text) return NextResponse.json({ error: "customName 与 text 必填" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "请上传参考音频文件" }, { status: 400 });

  const form = new FormData();
  form.append("model", model);
  form.append("customName", customName);
  form.append("text", text);
  form.append("file", file, file.name);

  const endpoint = `${baseUrl}/uploads/audio/voice`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  const responseText = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: "上传参考音频失败", detail: `${endpoint} -> HTTP ${res.status}: ${responseText.slice(0, 320)}` },
      { status: 502 }
    );
  }
  return new Response(responseText, { status: 200, headers: { "Content-Type": "application/json" } });
}
