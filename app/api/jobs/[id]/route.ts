import { getJob } from "@/lib/jobs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "job 不存在" }, { status: 404 });
  }
  return NextResponse.json(job);
}
