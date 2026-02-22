const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  try {
    await page.goto("http://127.0.0.1:3007", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".landing-home", { timeout: 20000 });

    const platformTrigger = page.locator("form .fancy-trigger").first();
    await platformTrigger.click();
    await page.waitForSelector(".fancy-menu", { timeout: 8000 });
    await page.locator(".fancy-option").nth(1).click();
    await page.waitForTimeout(150);
    const menuLeft = await page.locator(".fancy-menu").count();

    await page.locator(".top-nav button", { hasText: "设置" }).click();
    await page.waitForSelector(".settings-modal", { timeout: 8000 });
    await page.locator(".settings-nav button", { hasText: "硅基流动 TTS" }).click();
    await page.locator(".settings-card .ghost-btn", { hasText: "测试语音效果" }).click();
    await page.waitForSelector(".settings-card .health-card", { timeout: 15000 });
    const ttsText = await page.locator(".settings-card .health-card").first().innerText();

    await page.locator(".settings-top .ghost-btn", { hasText: "关闭" }).click();
    await page.waitForSelector(".settings-modal", { state: "hidden", timeout: 8000 });
    await page.locator(".top-nav button", { hasText: "工作台" }).click();

    const bgmTrigger = page.locator(".galgame-panel .fancy-trigger").first();
    await bgmTrigger.click();
    await page.waitForSelector(".galgame-panel .fancy-menu", { timeout: 8000 });
    const bgmOptions = await page.locator(".galgame-panel .fancy-option").count();

    console.log(JSON.stringify({
      ok: true,
      dropdownClosedAfterPick: menuLeft === 0,
      bgmOptions,
      ttsCheck: ttsText.replace(/\s+/g, " ").slice(0, 120)
    }, null, 2));
  } catch (error) {
    await page.screenshot({ path: "scripts/smoke-stage2-error.png", fullPage: true });
    console.log(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
