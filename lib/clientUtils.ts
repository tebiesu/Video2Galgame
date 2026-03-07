export function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function isQuotaExceeded(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: number };
  return e.name === "QuotaExceededError" || e.code === 22;
}

export async function toOptimizedImageDataUrl(file: File, maxSide = 1600, quality = 0.82): Promise<string> {
  const raw = await toDataUrl(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("图片解析失败"));
    img.src = raw;
  });

  const longSide = Math.max(img.width, img.height) || 1;
  const scale = Math.min(1, maxSide / longSide);
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return raw;
  const keepAlpha = /png|webp/i.test(file.type);
  if (!keepAlpha) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);
  return keepAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", quality);
}

export async function toOptimizedSpriteDataUrl(
  file: File,
  maxWidth = 900,
  maxHeight = 1400,
  quality = 0.82
): Promise<string> {
  const raw = await toDataUrl(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("图片解析失败"));
    img.src = raw;
  });

  const srcW = Math.max(1, img.width);
  const srcH = Math.max(1, img.height);
  const scale = Math.min(1, maxWidth / srcW, maxHeight / srcH);
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return raw;
  const keepAlpha = /png|webp/i.test(file.type);
  if (!keepAlpha) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);
  return keepAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", quality);
}
