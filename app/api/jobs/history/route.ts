import { listJobs } from "@/lib/jobs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") || 40);
  const jobs = await listJobs(limit);
  return NextResponse.json({ items: jobs });
}
