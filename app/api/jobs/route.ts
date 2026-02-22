import { createJob } from "@/lib/jobs";
import { TEMPLATES } from "@/lib/templates";
import type { JobInput, Platform } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function isPlatform(x: string): x is Platform {
  return x === "youtube" || x === "bilibili";
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Partial<JobInput>;

    if (!body.platform || !isPlatform(body.platform)) {
      return NextResponse.json({ error: "platform 必须是 youtube 或 bilibili" }, { status: 400 });
    }

    if (!body.url?.trim()) {
      return NextResponse.json({ error: "url 不能为空" }, { status: 400 });
    }

    if (!body.modelConfig?.baseUrl || !body.modelConfig?.apiKey || !body.modelConfig?.model) {
      return NextResponse.json({ error: "modelConfig.baseUrl/apiKey/model 为必填项" }, { status: 400 });
    }

    const templateId = body.templateId || TEMPLATES[0].id;
    const input: JobInput = {
      platform: body.platform,
      url: body.url.trim(),
      templateId,
      summaryMode: body.summaryMode || "template",
      roleName: body.roleName || "解析助手",
      customSystemPrompt: body.customSystemPrompt || "",
      modelConfig: body.modelConfig,
      parseOptions: {
        lang: body.parseOptions?.lang,
        commentNum: body.parseOptions?.commentNum ?? 0,
        danmakuNum: body.parseOptions?.danmakuNum ?? 0,
        snapshots: body.parseOptions?.snapshots ?? "",
        needSubs: body.parseOptions?.needSubs ?? true,
        needPbp: body.parseOptions?.needPbp ?? true
      }
    };

    const created = await createJob(input);
    return NextResponse.json({ jobId: created.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

