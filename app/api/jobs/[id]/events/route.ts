import { getJob } from "@/lib/jobs";

export const runtime = "nodejs";

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) {
    return new Response(JSON.stringify({ error: "job 不存在" }), {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let lastStage = job.stage;
      controller.enqueue(encoder.encode(sseEvent("stage", { stage: lastStage })));
      const timer = setInterval(async () => {
        const latest = await getJob(id);
        if (!latest) return;
        if (latest.stage !== lastStage) {
          lastStage = latest.stage;
          controller.enqueue(encoder.encode(sseEvent("stage", { stage: lastStage })));
        }
        if (latest.stage === "completed" || latest.stage === "failed") {
          clearInterval(timer);
          controller.close();
        }
      }, 1000);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
