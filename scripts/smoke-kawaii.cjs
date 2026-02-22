const { chromium } = require("playwright");

(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage();
  await p.goto("http://127.0.0.1:3005");
  await p.click("text=工作台");
  await p.click(".fancy-trigger");
  await p.waitForSelector(".fancy-menu");
  await p.click("text=设置");
  await p.waitForSelector(".settings-modal");
  await p.click("text=硅基流动 TTS");
  const overflow = await p.$eval(".settings-content", (el) => getComputedStyle(el).overflowY);
  console.log("overflow", overflow);
  await p.screenshot({ path: "scripts/ui-kawaii-fix.png", fullPage: true });
  await b.close();
})();

