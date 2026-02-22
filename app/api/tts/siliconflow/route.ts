import type { TtsConfig } from "@/lib/settings";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface Payload {
  text: string;
  config: Partial<TtsConfig>;
}

function toBaseUrl(input?: string): string {
  const raw = (input || "https://api.siliconflow.cn/v1").trim().replace(/\/+$/, "");
  return raw.replace("api.siliconflow.com", "api.siliconflow.cn");
}

function normalizeApiKey(input?: string): string {
  const text = (input || "").trim().replace(/^["']|["']$/g, "");
  return text.replace(/^Bearer\s+/i, "").trim();
}

function endpointCandidates(baseUrl: string): string[] {
  if (/\/v\d+$/i.test(baseUrl)) return [`${baseUrl}/audio/speech`];
  return [`${baseUrl}/v1/audio/speech`, `${baseUrl}/audio/speech`];
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Partial<Payload>;
    if (!body.text?.trim()) {
      return NextResponse.json({ error: "text 不能为空" }, { status: 400 });
    }

    const config = body.config || {};
    const apiKey = normalizeApiKey(config.apiKey);
    if (!apiKey) {
      return NextResponse.json({ error: "缺少 SiliconFlow API Key" }, { status: 400 });
    }

    const payload = JSON.stringify({
      model: config.model || "FunAudioLLM/CosyVoice2-0.5B",
      input: body.text.trim().slice(0, 1200),
      voice: config.voice || "FunAudioLLM/CosyVoice2-0.5B:claire",
      response_format: config.responseFormat || "mp3",
      sample_rate: config.sampleRate || 44100,
      speed: Number(config.speed ?? 1),
      gain: Number(config.gain ?? 0)
    });
    const endpoints = endpointCandidates(toBaseUrl(config.baseUrl));
    const errors: string[] = [];

    for (const endpoint of endpoints) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: payload
      });
      if (!res.ok) {
        const text = await res.text();
        errors.push(`${endpoint} -> HTTP ${res.status}: ${text.slice(0, 140)}`);
        continue;
      }

      const bytes = await res.arrayBuffer();
      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": `audio/${config.responseFormat || "mp3"}`,
          "Cache-Control": "no-store"
        }
      });
    }

    return NextResponse.json({ error: "TTS 调用失败", detail: errors.join("\n").slice(0, 500) }, { status: 502 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
