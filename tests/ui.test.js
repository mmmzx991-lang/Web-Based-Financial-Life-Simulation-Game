import test from "node:test";
import assert from "node:assert/strict";
import * as config from "../server/core/config.js";
import { createGame, report } from "../server/core/simulation.js";
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.document = { documentElement: { lang: "en" } };
const { setLanguage, t } = await import("../public/i18n.js");
const { pages, tradeDialog, pausedBanner } = await import("../public/views.js");
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
test("trade inputs match integer-unit core and cannot default to invalid fractional crypto", () => {
  const html = tradeDialog(state, "bitcoin");
  assert.match(html, /name="quantity" value="1"/);
  assert.match(html, /step="1"/);
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
