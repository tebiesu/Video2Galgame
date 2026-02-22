const { chromium } = require("playwright");

(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage();
  await p.goto("http://127.0.0.1:3004");
  await p.click("text=打开设置");
  await p.waitForSelector(".settings-modal");
  await p.click("text=硅基流动 TTS");
  await p.fill("input[placeholder='https://api.siliconflow.com/v1']", "https://api.siliconflow.com/v1");
  await p.click("text=关闭");
  await p.waitForTimeout(300);
  await p.click("text=队列");
  await p.click("text=模板工坊");
  await p.click("text=历史");
  await p.screenshot({ path: "scripts/ui-round4.png", fullPage: true });
  console.log("ok");
  await b.close();
})();
