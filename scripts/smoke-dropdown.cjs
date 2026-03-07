const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage();
  await p.goto("http://127.0.0.1:3007");
  await p.click("text=工作台");
  await p.click("text=平台");
  await p.click(".fancy-trigger");
  await p.waitForSelector(".fancy-menu");
  await p.click(".fancy-option:nth-child(2)");
  const menuCount = await p.locator(".fancy-menu").count();

  await p.click("text=系统设置");
  await p.waitForSelector(".settings-modal");
  await p.click("text=GalGame 参数");
  await p.click("text=关闭");

  await p.click("text=工作台");
  await p.click("text=开始解析与总结").catch(()=>{});
  // Open BGM preset select in Galgame panel if present
  const presetTrigger = p.locator("text=背景音乐预设").locator("xpath=../following-sibling::*[1] .fancy-trigger");
  const hasPreset = await presetTrigger.count();
  if (hasPreset > 0) {
    await presetTrigger.first().click();
    await p.waitForSelector(".fancy-menu", { timeout: 5000 });
  }

  console.log(JSON.stringify({ closedAfterPick: menuCount === 0, hasPreset }));
  await b.close();
})();
