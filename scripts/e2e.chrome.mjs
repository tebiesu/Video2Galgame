import { chromium } from "playwright";

const targetUrl = "http://127.0.0.1:3002";
const videoUrl = "https://www.bilibili.com/video/BV1fjcgzLE43?vd_source=aaeda2c783eeb5ac21033bf1599997e1";

function withV1(base) {
  const trimmed = (base || "").replace(/\/+$/, "");
  if (!trimmed) return "";
  return /\/v\d+$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

function withoutV1(base) {
  return (base || "").replace(/\/+$/, "").replace(/\/v\d+$/i, "");
}

async function waitForHealth(page) {
  await page.waitForSelector(".health-card", { timeout: 25000 });
  await page.waitForTimeout(500);
  return (await page.locator(".health-card").first().innerText()).trim();
}

async function waitForSummary(page) {
  const lane = page.locator(".lane").nth(1);
  for (let i = 0; i < 140; i += 1) {
    const text = (await lane.innerText()).trim();
    if (!text.includes("暂无摘要") && text.length > 40) {
      return text;
    }
    await page.waitForTimeout(2000);
  }
  throw new Error("等待摘要产出超时");
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();

const logs = [];
try {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  logs.push("打开首页成功");

  await page.getByRole("button", { name: "打开设置" }).click();
  await page.waitForSelector(".settings-modal", { timeout: 10000 });
  logs.push("打开设置中心成功");

  const baseInput = page.getByPlaceholder("https://api.example.com/v1");
  const apiKeyInput = page.getByPlaceholder("sk-...");
  const modelInput = page.getByPlaceholder("gpt-4o-mini");

  const existingBase = (await baseInput.inputValue()).trim();
  const existingApiKey = (await apiKeyInput.inputValue()).trim();
  const existingModel = (await modelInput.inputValue()).trim();

  if (!existingBase || !existingApiKey || !existingModel) {
    throw new Error("设置中心缺少 provider 配置，无法执行端到端测试");
  }

  const badBase = withoutV1(existingBase);
  await baseInput.fill(badBase);
  await page.getByRole("button", { name: "一键诊断连通性" }).click();
  const badResult = await waitForHealth(page);
  logs.push(`缺少 /v1 诊断结果: ${badResult.replace(/\s+/g, " ").slice(0, 120)}`);

  const goodBase = withV1(existingBase);
  await baseInput.fill(goodBase);
  await page.getByRole("button", { name: "一键诊断连通性" }).click();
  const goodResult = await waitForHealth(page);
  logs.push(`补全 /v1 诊断结果: ${goodResult.replace(/\s+/g, " ").slice(0, 120)}`);

  await page.getByRole("button", { name: "保存设置" }).first().click();
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: "工作台" }).click();
  await page.getByPlaceholder("https://www.youtube.com/watch?v=...").fill(videoUrl);
  await page.getByRole("button", { name: "开始解析与总结" }).click();
  logs.push("已提交 B 站任务");

  const summaryText = await waitForSummary(page);
  logs.push(`摘要面板长度: ${summaryText.length}`);

  await page.getByRole("button", { name: "存档" }).first().click();
  await page.waitForTimeout(1000);
  const historyCount = await page.locator(".history-item").count();
  logs.push(`历史任务数量: ${historyCount}`);

  await page.screenshot({ path: "scripts/e2e-result.png", fullPage: true });

  console.log(JSON.stringify({ ok: true, logs, badResult, goodResult, historyCount }, null, 2));
} catch (error) {
  await page.screenshot({ path: "scripts/e2e-error.png", fullPage: true });
  console.log(
    JSON.stringify(
      { ok: false, logs, error: error instanceof Error ? error.message : String(error) },
      null,
      2
    )
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
