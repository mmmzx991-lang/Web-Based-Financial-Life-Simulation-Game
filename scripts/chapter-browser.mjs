import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
const dir = mkdtempSync(join(tmpdir(), "investment-chapters-"));
const server = createApp({ dataDir: dir });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.locator('[data-view="setup"]').first().click();
  await page.locator("[data-start-game]").click();
  await page.locator(".life-layout").waitFor();
  const nav = (view) => page.locator(`.sidebar [data-view="${view}"]`).click();
  await nav("market");
  await page
    .getByText("Financial planning and protection", { exact: true })
    .waitFor();
  assert.equal(await page.locator("[data-trade]").count(), 0);
  await page.locator('[data-action="enable-emergency-cover"]').click();
  await page.locator('[data-confirm="yes"]').click();
  await page.locator('[data-action="disable-emergency-cover"]').waitFor();
  await nav("bank");
  await page.locator('[data-form="open-deposit"]').waitFor();
  assert.equal(
    await page.locator('[data-action="disable-emergency-cover"]').count(),
    0,
  );
  await nav("life");
  const id = await page.evaluate(() =>
    localStorage.getItem("investment-last-game"),
  );
  const api = origin + "/api/games/" + id;
  let data = await (await page.request.get(api)).json();
  async function advanceTo(month) {
    const request = async (action) => {
      const res = await page.request.post(api + "/action", {
        data: { action, requestId: randomUUID() },
      });
      assert.equal(res.status(), 200, await res.text());
      data = await res.json();
    };
    while (data.game.elapsedMonths < month || data.game.pendingEvent)
      await request(
        data.game.pendingEvent
          ? { type: "acknowledge-event" }
          : { type: "advance", months: 1 },
      );
  }
  await advanceTo(35);
  await page.reload();
  await page
    .locator('[data-action="advance"][data-months="3"]')
    .first()
    .click();
  await page.locator("dialog[open] [data-save-exit]").waitFor();
  assert.match(await page.locator("dialog").innerText(), /100/);
  await page.locator("dialog [data-save-exit]").click();
  await page.locator("[data-load]").first().waitFor();
  await page.reload();
  await page.locator("[data-load]").first().click();
  await page.locator(".life-layout").waitFor();
  assert.equal(await page.locator("dialog[open]").count(), 0);
  data = await (await page.request.get(api)).json();
  assert.equal(data.game.elapsedMonths, 36);
  assert.equal(data.game.journey.results.length, 1);
  assert.equal(data.game.journey.carry, 2);
  await nav("market");
  await page.getByText("Spot stock desk", { exact: true }).waitFor();
  assert.ok(await page.locator("[data-trade]").count());
  assert.equal(await page.locator('[data-trade="bitcoin"]').count(), 0);
  await nav("life");
  await page.locator('[data-action="continue-months"]').first().click();
  await page.locator('[data-action="advance"]').first().waitFor();
  data = await (await page.request.get(api)).json();
  assert.equal(data.game.elapsedMonths, 38);
  await advanceTo(95);
  await page.reload();
  await page
    .locator('[data-action="advance"][data-months="3"]')
    .first()
    .click();
  const settlement = page.locator("dialog[open]");
  await settlement.getByText(/Month 96/).waitFor();
  await settlement.locator("[data-chapter-continue]").click();
  await page.locator("dialog").waitFor({ state: "hidden" });
  data = await (await page.request.get(api)).json();
  assert.equal(data.game.elapsedMonths, 98);
  assert.equal(data.game.journey.results.length, 2);
  await nav("market");
  await page.getByText("Multi-asset trading desk", { exact: true }).waitFor();
  await page.locator('[data-trade="bitcoin"]').waitFor();
  await page.locator(".session-bar [data-save-exit]").click();
  await page.locator("[data-load]").first().click();
  await nav("profile");
  await page.getByText("Chapter medals", { exact: true }).waitFor();
  assert.equal(
    await page.locator("details summary").filter({ hasText: "🏅" }).count(),
    2,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: stages 36 and 96, carry-over, all trading desks, late save and persistent medals",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}
