import test from "node:test";
import assert from "node:assert/strict";
import * as config from "../server/core/config.js";
import { createGame, report } from "../server/core/simulation.js";
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.document = { documentElement: { lang: "en" } };
const { setLanguage, t } = await import("../public/i18n.js");
const { pages, tradeDialog, pausedBanner, shell } = await import(
  "../public/views.js"
);
const { exportReport } = await import("../public/export-report.js");
const game = createGame({}),
  state = {
    user: { displayName: "<script>alert(1)</script>" },
    session: { id: "fixture", game, summary: report(game) },
    view: "life",
    config: {
      modes: config.MODES,
      difficulties: config.DIFFICULTIES,
      rulesets: config.RULESETS,
      assets: config.ASSETS,
      propertyTypes: config.PROPERTY_TYPES,
      businessTypes: config.BUSINESS_TYPES,
      settings: config.SETTINGS,
    },
    selection: { mode: "full-life", difficulty: "normal", ruleset: "standard" },
    leaderboardFilter: { mode: "full-life", difficulty: "normal" },
    games: [],
    entries: [],
  };
test("all views render in both languages without invalid financial values or unescaped user names", () => {
  for (const language of ["en", "zh"]) {
    setLanguage(language);
    for (const [name, render] of Object.entries(pages)) {
      const html = render(state);
      assert.doesNotMatch(
        html,
        /NaN|undefined|<script>/,
        `${language}/${name}`,
      );
    }
  }
  assert.equal(t("market"), "市场");
});
test("leaderboard displays the score total, not a score object", () => {
  const html = pages.leaderboard({
    ...state,
    entries: [
      {
        displayName: "Player",
        score: { total: 69.43 },
        realNetWorth: 150000000,
      },
    ],
  });
  assert.match(html, /69\.43/);
  assert.doesNotMatch(html, /NaN/);
});
test("crypto begins at0.01 while stock orders stay whole units", () => {
  const html = tradeDialog(state, "bitcoin");
  assert.match(html, /name="quantity" value="0.01"/);
  assert.match(html, /step="0.01"/);
  const stock = tradeDialog(state, config.ASSETS[0].id);
  assert.match(stock, /step="1"/);
});
test("player views and shared shell omit implementation notes in both languages", () => {
  for (const language of ["en", "zh"]) {
    setLanguage(language);
    for (const [name, view] of Object.entries(pages)) {
      assert.doesNotMatch(
        shell(state, view(state)),
        /README|proposal|configurable game|prepared bilingual news templates|live news feed|不接入实时新闻|预设双语新闻模板|按 proposal|游戏参数|prototype|UI concept/i,
        `${language}/${name}`,
      );
    }
  }
});
test("markets have separate categories, commodity subgroups and asset search", () => {
  setLanguage("en");
  assert.match(pages.market(state), /data-market-group="stocks"/);
  const energy = pages.market({
    ...state,
    marketFilter: "commodities",
    marketSubfilter: "energy",
  });
  assert.match(energy, /Crude Oil/);
  assert.match(energy, /Natural Gas/);
  assert.doesNotMatch(energy, />Wheat</);
  const searched = pages.market({
    ...state,
    marketFilter: "stocks",
    marketSearch: "harbor",
  });
  assert.match(searched, /Harbor Bank/);
  assert.doesNotMatch(searched, />Meridian Technology</);
});
test("an extended unpaid bill exposes resume and never offers a second extension", () => {
  const html = pausedBanner({
    ...game,
    status: "paused",
    unpaidBill: { amount: 10000, extended: true },
    remainingAdvance: 1,
    pendingSettlement: null,
  });
  assert.match(html, /data-action="resume"/);
  assert.doesNotMatch(html, /data-action="extend-bill"/);
  assert.doesNotMatch(html, /data-action="declare-bankruptcy"/);
});
test("business action data attributes preserve camel-case action fields in the browser", () => {
  assert.match(pages.business(state), /data-business-type="coffee-shop"/);
});
test("CSV reports contain localized headings, RM units and the saved opening record", () => {
  setLanguage("en");
  assert.match(
    exportReport(game, report(game)),
    /"Net worth \(RM\)","60000.00"/,
  );
  setLanguage("zh");
  const csv = exportReport(game, report(game));
  assert.match(csv, /"净资产 \(RM\)","60000.00"/);
  assert.match(csv, /月度记录/);
  assert.ok(csv.startsWith("\ufeff"));
});

test("fractional display uses exact integer-sen valuation", async () => {
  const { orderValue } = await import("../public/order-math.js");
  assert.equal(orderValue({ category: "crypto" }, 0.29, 50), 15);
  const fixture = structuredClone(state);
  fixture.session.game.holdings.bitcoin = {
    quantity: 0.29,
    lockedQuantity: 0,
    averageCost: 50,
  };
  fixture.session.game.prices.bitcoin = 50;
  setLanguage("en");
  assert.match(pages.assets(fixture), /0\.15/);
});

test("session bar offers advance only for active runs and routes paused and completed games", () => {
  for (const status of ["active", "paused", "completed"]) {
    const fixture = structuredClone(state);
    fixture.view = "market";
    fixture.session.game.status = status;
    const html = shell(fixture, "");
    assert.match(html, /session-bar/);
    const bar =
      html.match(/<section class="session-bar[\s\S]*?<\/section>/)?.[0] || "";
    if (status === "active") assert.match(bar, /data-action="advance"/);
    else assert.doesNotMatch(bar, /data-action="advance"/);
  }
});
