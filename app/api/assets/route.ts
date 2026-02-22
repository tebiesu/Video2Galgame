import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

function contentTypeByExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".jpeg":
    case ".jpg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const p = searchParams.get("path");
  if (!p) return new Response("missing path", { status: 400 });

  const abs = path.resolve(p);
  const allowRoots = [
    path.resolve(process.cwd(), "image"),
    path.resolve(process.cwd(), "services/video-adapter/image")
  ];
  if (!allowRoots.some((root) => abs.startsWith(root))) {
    return new Response("forbidden", { status: 403 });
  }

  try {
    const buf = await readFile(abs);
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": contentTypeByExt(path.extname(abs)),
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
