import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { createApp } from "../server/app.js";

const directory = mkdtempSync(join(process.cwd(), ".test-data-browser-"));
const screenshots = resolve(process.env.SCREENSHOTS_DIR || ".browser-results");
mkdirSync(screenshots, { recursive: true });
const server = createApp({ dataDir: directory });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE
      ? { executablePath: process.env.BROWSER_EXECUTABLE }
      : existsSync(edge)
        ? { executablePath: edge }
        : {}),
  });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(base);
  await page.locator('[data-view="setup"]').first().waitFor();
  await page.screenshot({
    path: join(screenshots, "desktop-home-en.png"),
    fullPage: true,
  });
  await page.locator("[data-language]").click();
  assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
  assert.match(await page.locator("h1").innerText(), /人生/);
  await page.locator("[data-language]").click();
  await page.locator('[data-view="setup"]').first().click();
  await page.locator('[data-mode="wealth-building"]').click();
  await page.locator('[data-difficulty="normal"]').click();
  assert.match(await page.locator(".setup-preview").innerText(), /140,000/);
  await page.locator("[data-start-game]").click();
  await page.locator(".life-layout").waitFor();
  const nav = async (id) => {
    await page.locator(`.sidebar [data-view="${id}"]`).first().click();
    await page.waitForFunction(
      () => !document.getElementById("app").hasAttribute("aria-busy"),
    );
  };
  const action = async (selector) => {
    await page.locator(selector).first().click();
    await page.waitForFunction(
      () => !document.getElementById("app").hasAttribute("aria-busy"),
    );
  };
  await nav("market");
  assert.equal(
    await page.locator('.session-bar [data-action="advance"]').count(),
    2,
  );
  await page.locator("[data-trade]").first().click();
  await page.locator('[data-quantity-preset="25"]').click();
  assert.ok(
    Number(await page.locator('#trade-form [name="quantity"]').inputValue()) >
      0,
  );
  await page.locator('[data-quantity-preset="100"]').click();
  assert.equal(
    await page.locator('#trade-form button[type="submit"]').isEnabled(),
    true,
  );
  await page.locator('#trade-form [name="quantity"]').fill("100000000");
  assert.equal(
    await page.locator('#trade-form button[type="submit"]').isDisabled(),
    true,
  );
  await page.locator('#trade-form [name="quantity"]').fill("10");
  await page.locator('#trade-form [name="leverage"]').selectOption("2");
  const quote = await page
    .locator("#trade-quote .detail-row:last-child strong")
    .innerText();
  await page.locator('#trade-form [name="side"]').selectOption("sell");
  await page.locator('#trade-form [name="side"]').selectOption("buy");
  assert.equal(
    await page
      .locator("#trade-quote .detail-row:last-child strong")
      .innerText(),
    quote,
  );
  await page.locator('#trade-form [name="leverage"]').selectOption("1");
  await page.locator('#trade-form button[type="submit"]').click();
  await page.locator("#dialog").waitFor({ state: "hidden" });
  await page.locator("[data-trade]").first().click();
  await page.locator('#trade-form [name="side"]').selectOption("sell");
  await page.locator('#trade-form [name="quantity"]').fill("1");
  await page.locator('#trade-form button[type="submit"]').click();
  await page.waitForFunction(
    () => document.getElementById("dialog-error")?.textContent.length > 0,
  );
  assert.match(
    await page.locator("#dialog-error").innerText(),
    /locked|eligible/i,
  );
  await page.locator("#dialog-close").click();
  await page.waitForFunction(() =>
    document.activeElement?.hasAttribute("data-trade"),
  );
  await page.locator('[data-market-group="crypto"]').click();
  assert.equal(await page.locator("[data-trade]").count(), 2);
  await page.locator('[data-trade="bitcoin"]').click();
  assert.equal(
    await page.locator('#trade-form [name="quantity"]').inputValue(),
    "0.01",
  );
  assert.equal(
    await page.locator('#trade-form [name="quantity"]').getAttribute("step"),
    "0.01",
  );
  await page.screenshot({
    path: join(screenshots, "desktop-crypto-detail-en.png"),
    fullPage: true,
  });
  await page.locator('#trade-form button[type="submit"]').click();
  await page.locator("#dialog").waitFor({ state: "hidden" });
  const currentGame = async () => {
    const id = await page.evaluate(() =>
      localStorage.getItem("investment-last-game"),
    );
    return (await page.request.get(base + "/api/games/" + id)).json();
  };
  let cryptoRun = await currentGame();
  assert.equal(cryptoRun.game.holdings.bitcoin.quantity, 0.01);
  assert.ok(Number.isSafeInteger(cryptoRun.game.cash));
  await nav("life");
  await action('[data-action="advance"][data-months="1"]');
  await nav("market");
  await page.locator('[data-market-group="crypto"]').click();
  await page.locator('[data-trade="bitcoin"]').click();
  await page.locator('#trade-form [name="side"]').selectOption("sell");
  await page.locator('#trade-form button[type="submit"]').click();
  await page.locator("#dialog").waitFor({ state: "hidden" });
  cryptoRun = await currentGame();
  assert.equal(cryptoRun.game.holdings.bitcoin?.quantity || 0, 0);
  assert.ok(Number.isSafeInteger(cryptoRun.game.cash));
  await page.locator('[data-market-group="commodities"]').click();
  for (const group of ["energy", "metals", "agriculture"]) {
    await page.locator('[data-subfilter="' + group + '"]').click();
    assert.equal(await page.locator("[data-trade]").count(), 2);
  }
  await page.locator('[data-market-group="stocks"]').click();
  await page.locator("#market-search").fill("Harbor");
  assert.equal(await page.locator("[data-trade]").count(), 1);
  await page.locator("#market-search").fill("");
  await page.locator("#market-sort").selectOption("change");
  await page.screenshot({
    path: join(screenshots, "desktop-markets-en.png"),
    fullPage: true,
  });
  await page.locator('[data-market-group="crypto"]').click();
  await page.locator('[data-trade="bitcoin"]').click();
  await page.locator('#trade-form [name="quantity"]').fill("0.03");
  await page.locator('#trade-form [name="leverage"]').selectOption("3");
  assert.match(
    await page.locator("#trade-quote").innerText(),
    /Initial margin/,
  );
  assert.match(
    await page.locator("#trade-quote").innerText(),
    /Estimated liquidation/,
  );
  await page.locator('#trade-form button[type="submit"]').click();
  await page.locator("#dialog").waitFor({ state: "hidden" });
  await nav("assets");
  assert.equal(await page.locator("[data-close-position]").isDisabled(), true);
  await nav("life");
  await action('[data-action="advance"][data-months="1"]');
  await nav("assets");
  assert.equal(await page.locator("[data-close-position]").isEnabled(), true);
  assert.match(
    await page.locator(".position-card").innerText(),
    /Position equity|Unrealized/,
  );
  await page.screenshot({
    path: join(screenshots, "desktop-positions-en.png"),
    fullPage: true,
  });
  await page.locator("[data-close-position]").click();
  await page.locator('#close-position-form [name="quantity"]').fill("0.01");
  const beforePartial = await currentGame();
  await page.locator('#close-position-form button[type="submit"]').click();
  await page.locator("#dialog").waitFor({ state: "hidden" });
  const afterPartial = await currentGame();
  assert.equal(afterPartial.game.positions[0].quantity, 0.02);
  assert.equal(afterPartial.game.positionHistory.at(-1).quantity, 0.01);
  assert.equal(
    afterPartial.game.cash - beforePartial.game.cash,
    afterPartial.game.positionHistory.at(-1).proceeds,
  );
  await nav("bank");
  await page
    .locator('[data-form="transfer"]')
    .first()
    .locator('[name="amount"]')
    .fill("1000");
  await page
    .locator('[data-form="transfer"]')
    .first()
    .locator('button[type="submit"]')
    .click();
  await page.waitForFunction(
    () => !document.getElementById("app").hasAttribute("aria-busy"),
  );
  await nav("business");
  await page.locator('[data-action="start-business"]').first().click();
  await page.locator('[data-confirm="yes"]').click();
  await page.waitForFunction(
    () => !document.getElementById("app").hasAttribute("aria-busy"),
  );
  await nav("life");
  await action('[data-action="advance"][data-months="3"]');
  await action('[data-action="advance"][data-months="3"]');
  await page.locator('[data-action="acknowledge-event"]').waitFor();
  await action('[data-action="acknowledge-event"]');
  await page.screenshot({
    path: join(screenshots, "desktop-life-en.png"),
    fullPage: true,
  });
  const me = await (await page.request.get(base + "/api/auth/me")).json();
  assert.ok(me.user.guest);
  await nav("profile");
  await page.locator('[data-auth="register"]').click();
  await page.locator('[name="displayName"]').fill("Browser Player");
  const email = `browser-${Date.now()}@example.test`;
  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="password"]').fill("Browser-Test-926");
  await page.locator('#auth-form button[type="submit"]').click();
  await page.locator("#dialog").waitFor({ state: "hidden" });
  const upgraded = await (await page.request.get(base + "/api/auth/me")).json();
  assert.equal(upgraded.user.id, me.user.id);
  assert.equal(upgraded.user.guest, false);
  await page.reload();
  await page.locator(".life-layout").waitFor();
  assert.match(
    await page.locator(".header-context").innerText(),
    /Wealth Building/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("[data-language]").click();
  await page.screenshot({
    path: join(screenshots, "mobile-life-zh.png"),
    fullPage: true,
  });
  async function noOverflow() {
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "No page-level horizontal overflow",
    );
    assert.doesNotMatch(
      await page.locator("#app").innerText(),
      /undefined|NaN/,
    );
  }
  await noOverflow();
  await page.locator('.mobile-nav [data-view="assets"]').click();
  await noOverflow();
  await page.screenshot({
    path: join(screenshots, "mobile-positions-zh.png"),
    fullPage: true,
  });
  await page.locator("[data-close-position]").click();
  assert.equal(
    await page.locator('#close-position-form [name="quantity"]').inputValue(),
    "0.02",
  );
  await page.screenshot({
    path: join(screenshots, "mobile-close-preview-zh.png"),
    fullPage: true,
  });
  await page.locator('#close-position-form button[type="submit"]').click();
  await page.locator("#dialog").waitFor({ state: "hidden" });
  assert.equal((await currentGame()).game.positions.length, 0);
  for (const id of ["market", "assets", "news", "more"]) {
    await page.locator(`.mobile-nav [data-view="${id}"]`).click();
    await page.waitForFunction(
      () => !document.getElementById("app").hasAttribute("aria-busy"),
    );
    await noOverflow();
  }
  await page.locator('.mobile-nav [data-view="market"]').click();
  await page.locator('[data-market-group="crypto"]').click();
  await noOverflow();
  await page.screenshot({
    path: join(screenshots, "mobile-markets-zh.png"),
    fullPage: true,
  });
  await page.locator('[data-trade="bitcoin"]').click();
  assert.ok(
    await page
      .locator("#dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  );
  await page.screenshot({
    path: join(screenshots, "mobile-crypto-detail-zh.png"),
    fullPage: true,
  });
  await page.locator("#dialog-close").click();
  for (const id of [
    "property",
    "business",
    "bank",
    "report",
    "profile",
    "leaderboard",
    "help",
  ]) {
    await page.locator('.mobile-nav [data-view="more"]').click();
    await page.locator(`.more-grid [data-view="${id}"]`).click();
    await page.waitForFunction(
      () => !document.getElementById("app").hasAttribute("aria-busy"),
    );
    await noOverflow();
    if (id === "report") {
      await page.screenshot({
        path: join(screenshots, "mobile-report-zh.png"),
        fullPage: true,
      });
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.locator("[data-download]").click(),
      ]);
      assert.ok(download.suggestedFilename().endsWith("-zh.csv"));
      assert.match(readFileSync(await download.path(), "utf8"), /月度记录/);
    }
  }
  // Complete a real Standard game through authenticated public endpoints.
  const response = await page.request.post(base + "/api/games", {
    data: { mode: "early-career", difficulty: "easy", ruleset: "standard" },
  });
  assert.equal(response.status(), 201);
  let run = await response.json(),
    turns = 0;
  while (run.game.status !== "completed" && turns++ < 150) {
    assert.notEqual(run.game.status, "bankrupt");
    const action = run.game.pendingEvent
      ? { type: "acknowledge-event" }
      : run.game.status === "paused"
        ? { type: "resume" }
        : { type: "advance", months: 3 };
    const response = await page.request.post(
      base + `/api/games/${run.id}/action`,
      { data: { requestId: randomUUID(), action } },
    );
    assert.equal(response.status(), 200);
    run = await response.json();
  }
  assert.equal(run.game.status, "completed");
  assert.equal(run.game.elapsedMonths, 276);
  assert.equal(run.game.history.length, 277);
  const board = await (
    await page.request.get(
      base + "/api/leaderboard?mode=early-career&difficulty=easy",
    )
  ).json();
  assert.equal(board.entries[0].displayName, "Browser Player");
  assert.ok(Number.isFinite(board.entries[0].score.total));
  // Switching away from a guest must remove the previous owner's private state.
  const emptyContext = await browser.newContext();
  const loginEmail = `empty-${Date.now()}@example.test`;
  assert.equal(
    (
      await emptyContext.request.post(base + "/api/auth/register", {
        data: {
          email: loginEmail,
          displayName: "Empty Account",
          password: "Browser-Test-926",
        },
      })
    ).status(),
    201,
  );
  await emptyContext.close();
  const guestContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    guestPage = await guestContext.newPage();
  await guestPage.goto(base);
  await guestPage.locator('[data-view="setup"]').first().click();
  await guestPage.locator("[data-start-game]").click();
  await guestPage.locator(".life-layout").waitFor();
  await guestPage.locator('.sidebar [data-view="profile"]').click();
  await guestPage.locator('[data-auth="register"]').click();
  await guestPage.locator('[data-switch-auth="login"]').click();
  await guestPage.locator('[name="email"]').fill(loginEmail);
  await guestPage.locator('[name="password"]').fill("Browser-Test-926");
  await guestPage.locator('#auth-form button[type="submit"]').click();
  await guestPage.locator(".setup-layout").waitFor();
  assert.equal(await guestPage.locator(".sidebar").count(), 0);
  assert.equal(
    await guestPage.evaluate(() =>
      localStorage.getItem("investment-last-game"),
    ),
    null,
  );
  await guestContext.close();
  const expectedRejection =
    "Failed to load resource: the server responded with a status of 400 (Bad Request)";
  assert.equal(
    errors.filter((message) => message === expectedRejection).length,
    1,
    "Exactly one deliberately rejected same-month sale",
  );
  assert.deepEqual(
    errors.filter((message) => message !== expectedRejection),
    [],
  );
  console.log(
    JSON.stringify(
      {
        browser: "Chromium/Edge",
        languages: ["en", "zh-CN"],
        desktop: "1440x1000",
        mobile: "390x844",
        fullRunMonths: 276,
        checks:
          "guest, setup, trade lock, 0.01 crypto buy/sell, market categories/search/sort, sticky session actions, order quantity presets/validation, dialog focus return, leverage margin/liquidation previews, locked positions, partial/full close, savings, business, event pause, account upgrade, reload, every mobile view, final report and leaderboard",
        screenshots,
      },
      null,
      2,
    ),
  );
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
