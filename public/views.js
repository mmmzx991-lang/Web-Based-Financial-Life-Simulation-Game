import { positionMetrics } from "./leverage-math.js";
import { orderValue } from "./order-math.js";
import {
  t,
  text,
  money,
  number,
  percent,
  modeLabel,
  getLanguage,
} from "./i18n.js";
import { wealthChart, priceChart } from "./charts.js";
export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const E = escape;
const paths = {
  life: "M3 19h18M5 19V9l7-5 7 5v10M9 19v-6h6v6",
  market: "M4 19V5m0 14h16M8 14l4-5 4 3 4-7",
  assets: "M3 8h18v12H3zM8 8V4h8v4M3 12h18M10 12v3h4v-3",
  property: "M3 20V9l6-3v14M9 20V3l7 3v14M16 11l5-2v11M1 20h22",
  business: "M4 8h16l1 4H3l1-4zm0 4v8h16v-8M5 8V4h14v4M9 20v-5h6v5",
  bank: "m3 9 9-6 9 6H3zm2 3v6m5-6v6m4-6v6m5-6v6M2 21h20",
  news: "M5 4h14v16H5zM8 8h8m-8 4h8m-8 4h5",
  report: "M4 3h11l5 5v13H4zM14 3v6h6M8 17v-4m4 4v-6m4 6v-3",
  leaderboard:
    "M7 3h10v7a5 5 0 0 1-10 0V3zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 15v6m-4 0h8",
  profile: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM4 21v-2a8 8 0 0 1 16 0v2",
  more: "M5 5h2v2H5zm12 0h2v2h-2zM5 17h2v2H5zm12 0h2v2h-2z",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  save: "M4 3h14l3 3v15H3V3h1zm3 0v6h10V3M7 21v-8h10v8",
  clock: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  check: "m5 12 4 4L20 5",
  warning: "m12 3 10 18H2L12 3zm0 6v5m0 3v1",
  close: "m5 5 14 14M19 5 5 19",
  globe:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18",
  help: "M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 4v1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name] || paths.life}"/></svg>`;
const navButton = (id, active, mobile = false) =>
  `<button class="nav-item ${active === id ? "is-active" : ""}" data-view="${id}" ${active === id ? 'aria-current="page"' : ""}>${icon(id)}<span>${t(id)}</span></button>`;
const button = (label, attrs = "", kind = "primary") =>
  `<button class="button ${kind}" ${attrs}>${label}</button>`;
const pill = (label, kind = "") => `<span class="pill ${kind}">${label}</span>`;
const title = (eyebrow, heading, description = "") =>
  `<div class="page-title"><p class="eyebrow">${eyebrow}</p><h1>${heading}</h1>${description ? `<p>${description}</p>` : ""}</div>`;
const card = (label, value, detail = "", kind = "") =>
  `<article class="metric ${kind}"><p>${label}</p><strong>${value}</strong>${detail ? `<span>${detail}</span>` : ""}</article>`;
const field = (label, input) =>
  `<label class="field"><span>${label}</span>${input}</label>`;
const input = (name, value = "", options = "") =>
  `<input name="${name}" value="${E(value)}" ${options}>`;
const numeric = (name, value = "1", step = 1) =>
  input(
    name,
    value,
    `type="number" required min="${step}" step="${step}" inputmode="${step === 1 ? "numeric" : "decimal"}"`,
  );
const amount = (name = "amount", value = "1000") =>
  input(
    name,
    value,
    'type="number" required min="0.01" step="0.01" max="1000000000" inputmode="decimal"',
  );
const select = (name, options, value, attrs = "") =>
  `<select name="${name}" ${attrs}>${options.map(([key, label]) => `<option value="${E(key)}" ${String(key) === String(value) ? "selected" : ""}>${E(label)}</option>`).join("")}</select>`;
const rowsTable = (headings, rows) =>
  `<div class="table-wrap"><table><thead><tr>${headings.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
const empty = (message) =>
  `<div class="empty-state">${icon("assets")}<p>${message}</p></div>`;
const data = (key, value) =>
  `data-${key.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase())}="${E(value)}"`;
const canAct = (g) => g && !["completed", "bankrupt"].includes(g.status);
const actionButton = (label, action, values = {}, kind = "secondary") =>
  button(
    label,
    `data-action="${action}" ${Object.entries(values)
      .map(([k, v]) => data(k, v))
      .join(" ")}`,
    kind,
  );
const line = (label, value) =>
  `<div class="detail-row"><span>${label}</span><strong>${value}</strong></div>`;
const scene = () =>
  '<img class="world-scene" src="/game-world.svg" alt="" width="900" height="530">';
function headingState(game, summary) {
  const total = game.endAgeMonths - game.startAgeMonths;
  return `${t("age")} ${summary.age} · ${t("month")} ${Math.min(game.elapsedMonths + 1, total)}/${total}`;
}
export function shell(state, content) {
  const game = state.session?.game,
    summary = state.session?.summary;
  const signed = !!state.user;
  const navigation = [
    "life",
    "market",
    "assets",
    "news",
    "property",
    "business",
    "bank",
    "report",
  ];
  return `<header class="app-header"><button class="brand" data-view="${game ? "life" : "home"}"><span class="brand-mark">↗</span><span>${t("brand")}<small>${t("tagline")}</small></span></button><div class="header-context">${game ? `<strong>${headingState(game, summary)}</strong><span>${modeLabel(game.mode)} / ${t(game.difficulty)} / ${t(game.ruleset)}</span>` : ""}</div><div class="header-actions"><button class="language-button" data-language="${getLanguage() === "en" ? "zh" : "en"}" aria-label="${t("language")}">${icon("globe")}<span>${getLanguage() === "en" ? "中文" : "English"}</span></button><button class="avatar" ${signed ? 'data-view="profile"' : 'data-auth="login"'} aria-label="${signed ? t("profile") : t("signin")}">${signed ? E(state.user.displayName?.slice(0, 2).toUpperCase() || "IG") : icon("profile")}</button></div></header>
  <div class="app-layout ${game ? "has-sidebar" : ""}">${game ? `<aside class="sidebar"><p class="nav-caption">${t("brand")}</p><nav aria-label="${t("life")}">${navigation.map((id) => navButton(id, state.view)).join("")}</nav><div class="sidebar-bottom">${navButton("leaderboard", state.view)}${navButton("profile", state.view)}${navButton("help", state.view)}<div class="autosave-note">${icon("save")}<span>${t("autosaved")}</span></div></div></aside>` : ""}<main id="main" tabindex="-1">${content}<footer>${t("brand")} · ${t("tagline")}</footer></main></div>
  ${game ? `<nav class="mobile-nav" aria-label="${t("life")}">${["life", "market", "assets", "news", "more"].map((id) => navButton(id, state.view, true)).join("")}</nav>` : ""}`;
}
export function home(state) {
  return `<section class="home-hero"><div><p class="eyebrow">${t("tagline")}</p><h1>${t("heroTitle").replace("\n", "<br>")}</h1><p class="hero-description">${t("heroDescription")}</p><div class="hero-actions">${button(`${t("start")} ${icon("arrow")}`, 'data-view="setup"')}${state.session ? button(t("continue"), 'data-view="life"', "secondary") : button(t("signin"), 'data-auth="login"', "secondary")}</div><div class="hero-facts"><span>${t("fourModes")}</span><span>${t("fourLevels")}</span><span>${t("fifteenAssets")}</span></div></div><div class="hero-map">${scene()}<span class="map-tag map-tag-one">${icon("market")}${t("marketStreet")}</span><span class="map-tag map-tag-two">${icon("property")}${t("propertyQuarter")}</span><span class="map-tag map-tag-three">${icon("business")}${t("businessAvenue")}</span></div></section><div class="home-intro"><h2>${t("monthRhythm")}</h2><div class="three-columns">${[
    ["introPlan", "introPlanBody", "life"],
    ["introAdvance", "introAdvanceBody", "clock"],
    ["introLearn", "introLearnBody", "report"],
  ]
    .map(
      ([a, b, i], idx) =>
        `<article class="panel step-card"><span class="step-number">0${idx + 1}</span>${icon(i)}<h3>${t(a)}</h3><p>${t(b)}</p></article>`,
    )
    .join("")}</div></div>`;
}
export function setup(state) {
  const { config } = state,
    selection = state.selection;
  const modes = Object.entries(config.modes);
  const diff = config.difficulties[selection.difficulty],
    start = config.modes[selection.mode][0];
  const cash = diff[`cash${start}`] || 0,
    salary =
      start >= 60 ? 0 : Math.round(diff.salary22 * Math.pow(1.025, start - 22));
  const properties = diff[`properties${start}`] || [];
  return `${title(t("tagline"), t("setupTitle"), t("setupDescription"))}<div class="setup-layout"><section><div class="mode-grid">${modes.map(([id, [a, b]]) => `<button class="mode-card ${selection.mode === id ? "selected" : ""}" data-mode="${id}" aria-pressed="${selection.mode === id}"><div class="mode-icon">${icon(id === "retirement" ? "bank" : id === "wealth-building" ? "property" : id === "early-career" ? "business" : "life")}</div><span class="eyebrow">${(b - a) * 12} ${t("months")}</span><h2>${modeLabel(id)}</h2><strong>${a}–${b}</strong><span class="mode-tick">${selection.mode === id ? "✓" : "↗"}</span></button>`).join("")}</div><section class="panel"><h2>${t("difficulty")}</h2><div class="segmented">${Object.keys(
    config.difficulties,
  )
    .map(
      (id) =>
        `<button data-difficulty="${id}" class="${selection.difficulty === id ? "selected" : ""}" aria-pressed="${selection.difficulty === id}">${t(id)}</button>`,
    )
    .join(
      "",
    )}</div><p class="muted small">${t("difficultyHint")}</p><h2 class="space-top">${t("ruleset")}</h2><div class="rules-grid">${config.rulesets.map((id) => `<button class="rules-card ${selection.ruleset === id ? "selected" : ""}" data-ruleset="${id}" aria-pressed="${selection.ruleset === id}"><strong>${t(id)}</strong><span>${t(id + "Hint")}</span></button>`).join("")}</div></section></section><aside class="panel setup-preview"><p class="eyebrow">${t("selectedLife")}</p><h2>${modeLabel(selection.mode)}</h2><p>${t(selection.difficulty)} · ${t(selection.ruleset)}</p><div class="preview-amount">${money(cash)}</div><p class="muted">${t("startCash")}</p>${line(t("salary"), `${money(salary)} / ${t("month")}`)}${line(
    t("startProperty"),
    properties.length
      ? properties
          .map((type) => text(config.propertyTypes[type]?.name || type))
          .map(E)
          .join(" + ")
      : t("none"),
  )}${line(t("startDebt"), money(start === 60 ? diff.mortgage60 || 0 : 0))}<p class="small muted">${t("noOpeningInvestments")}</p>${button(`${t("begin")} ${icon("arrow")}`, "data-start-game", "primary full-width")}${!state.user ? `<p class="small muted">${t("guestHint")}</p>` : ""}</aside></div>`;
}
export function pausedBanner(game) {
  if (game.status !== "paused") return "";
  const bill = game.unpaidBill,
    event = game.pendingEvent;
  return `<section class="pause-banner ${bill ? "danger" : ""}" role="status"><div>${icon("warning")}<h2>${bill ? t("billTitle") : t("pauseTitle")}</h2></div>${event ? `<h3>${E(text(event.title))}</h3><p>${E(text(event.body))}</p>` : ""}${bill ? `${line(t("billAmount"), money(bill.amount))}${line(t("cash"), money(game.cash))}${line(t("shortfall"), money(Math.max(0, bill.amount - game.cash)))}<p>${t("billHint")}</p>` : ""}<p>${t("remaining")}: ${game.remainingAdvance || 0}</p><div class="action-row">${event ? actionButton(t("resolve"), "acknowledge-event") : ""}${bill ? actionButton(t("payBill"), "pay-bill") + (!bill.extended ? actionButton(t("extendBill"), "extend-bill") : pill(t("extensionUsed"))) : ""}${(!bill || (bill.extended && !game.pendingSettlement)) && !event ? actionButton(t("resume"), "resume", {}, "primary") : ""}${bill && game.pendingSettlement ? actionButton(t("declareBankruptcy"), "declare-bankruptcy", {}, "danger-button") : ""}</div></section>`;
}
function advanceButtons(game) {
  return `<div class="action-row">${actionButton(t("nextMonth"), "advance", { months: 1 }, "primary")}${actionButton(t("nextThree"), "advance", { months: 3 }, "secondary")}</div>`;
}
export function life(state) {
  const { game: g, summary: s } = state.session;
  return `${title(t("tagline"), t("dashboardTitle"), t("dashboardDescription"))}${pausedBanner(g)}${!canAct(g) ? `<div class="notice">${t("completedHint")} ${button(t("viewReport"), 'data-view="report"', "secondary")}</div>` : ""}<div class="metrics four">${card(t("netWorth"), money(s.netWorth), `${t("realWealth")} ${money(s.realNetWorth)}`, "highlight")}${card(t("cash"), money(g.cash), `${t("savings")} ${money(g.savings)}`)}${card(t("salary"), money(g.monthlySalary), s.retired ? t("retired") : t("monthlyLiving") + " " + money(s.age < 45 ? 200000 : s.age < 60 ? 300000 : 250000))}${card(t("liabilities"), money(s.liabilities), `${t("priceIndex")} ${number(g.priceIndex)}`)}</div><div class="life-layout"><section class="panel life-world"><div class="panel-heading"><div><p class="eyebrow">${t("thisMonth")}</p><h2>${t(g.economy || "recovery")}</h2></div>${pill(t("autosaved"), "success")}</div>${scene()}<div class="world-destinations">${[
    ["market", "marketStreet"],
    ["property", "propertyQuarter"],
    ["business", "businessAvenue"],
  ]
    .map(([id, key]) =>
      button(`${icon(id)} ${t(key)} ↗`, `data-view="${id}"`, "destination"),
    )
    .join(
      "",
    )}</div><div class="life-timeline">${[22, 45, 60, 80].map((a) => `<span class="${s.age >= a ? "passed" : ""}"><b>${a}</b>${a === 22 ? t("start") : a === 60 ? t("retired") : a === 80 ? t("report") : t("wealthBuilding")}</span>`).join("")}</div></section><aside><section class="panel move-card"><p class="eyebrow">${t("age")} ${s.age} · ${t("month")} ${g.elapsedMonths + 1}</p><h2>${t("introAdvance")}</h2>${advanceButtons(g)}<p class="small muted">${t("advanceHint")}</p>${line(t("assetsTotal"), money(s.assets))}${line(t("portfolioValue"), money(s.portfolioValue))}${line(t("propertyValue"), money(s.propertyValue))}${line(t("businessValue"), money(s.businessValue))}</section><section class="panel news-preview"><div class="panel-heading"><h2>${t("news")}</h2><button class="text-button" data-view="news">↗</button></div>${g.news?.length ? `<h3>${E(text(g.news[0].title))}</h3><p>${E(text(g.news[0].body))}</p>` : `<p>${t("noNews")}</p>`}</section></aside></div><section class="panel"><div class="panel-heading"><h2>${t("wealthJourney")}</h2><div class="chart-legend"><span>${t("netWorth")}</span><span>${t("benchmark")}</span></div></div>${wealthChart(g.history, { wealth: t("netWorth"), benchmark: t("benchmark"), age: t("age") })}</section>`;
}
export function market(state) {
  const { game: g } = state.session;
  const filter = state.marketFilter || "all";
  const groups = [
    ["stocks", "stock", "stockDescription"],
    ["crypto", "crypto", "cryptoDescription"],
    ["gold", "gold", "goldDescription"],
    ["commodities", "commodity", "commodityDescription"],
  ];
  const subfilter = state.marketSubfilter || "all",
    search = (state.marketSearch || "").trim().toLowerCase();
  const subgroup = (id) =>
    ["crude-oil", "natural-gas"].includes(id)
      ? "energy"
      : ["silver", "copper"].includes(id)
        ? "metals"
        : "agriculture";
  const change = (a) =>
    (g.prices[a.id] - (g.previousPrices?.[a.id] || g.prices[a.id])) /
    (g.previousPrices?.[a.id] || g.prices[a.id]);
  const selected = groups.find(([id]) => id === filter);
  const assets = state.config.assets
    .filter(
      (a) =>
        (filter === "all" || a.category === selected?.[1]) &&
        (filter !== "commodities" ||
          subfilter === "all" ||
          subgroup(a.id) === subfilter) &&
        (!search ||
          [a.symbol, a.id, ...Object.values(a.name)]
            .join(" ")
            .toLowerCase()
            .includes(search)),
    )
    .sort((a, b) =>
      state.marketSort === "change"
        ? change(b) - change(a)
        : state.marketSort === "price"
          ? g.prices[b.id] - g.prices[a.id]
          : text(a.name).localeCompare(text(b.name)),
    );
  const macro = g.macro;
  const overview = `<div class="market-categories">${groups
    .map(([id, category, description]) => {
      const count = state.config.assets.filter(
        (a) => a.category === category,
      ).length;
      return `<button class="market-category ${filter === id ? "selected" : ""}" data-market-group="${id}" aria-pressed="${filter === id}"><span class="category-emblem">${id === "crypto" ? "₿" : id === "gold" ? "Au" : icon(id === "stocks" ? "market" : "assets")}</span><strong>${t(id)}</strong><span>${count} ${t("instruments")}</span>${icon("arrow")}</button>`;
    })
    .join("")}</div>`;
  const sections = (filter === "all" ? groups : [selected])
    .filter(Boolean)
    .map(([id, category, description]) => {
      const rows = assets.filter((a) => a.category === category);
      if (!rows.length) return "";
      return `<section class="panel market-section" data-category-section="${id}"><div class="panel-heading"><div><h2>${t(id)}</h2><p class="small muted">${t(description)}</p></div>${pill(`${rows.length} ${t("instruments")}`)}</div>${rowsTable(
        [
          t("asset"),
          t("price"),
          t("change"),
          t("risk"),
          t("holding"),
          t("trade"),
        ],
        rows.map((a) => {
          const current = g.prices[a.id],
            delta = change(a),
            risk =
              a.risk ||
              (a.category === "crypto"
                ? "very-high"
                : a.category === "gold"
                  ? "medium"
                  : "high");
          return `<tr><td><div class="instrument-name"><span class="asset-symbol">${E(a.symbol)}</span><span><strong>${E(text(a.name))}</strong><small>${E(text(a.sector || { en: t(id), zh: t(id) }))}${a.category === "commodity" ? " · " + t(subgroup(a.id)) : ""}</small></span></div></td><td>${money(current)}<small class="instrument-unit">/ ${E(text(a.unit || { en: t("unitUnits"), zh: t("unitUnits") }))}</small></td><td class="${delta >= 0 ? "positive" : "negative"}">${delta >= 0 ? "↑" : "↓"} ${percent(Math.abs(delta))}</td><td><span class="risk-label">${typeof risk === "object" ? E(text(risk)) : t(risk)}</span></td><td>${number(g.holdings[a.id]?.quantity || 0)}</td><td>${button(t("marketDetails"), `data-trade="${E(a.id)}"`, "secondary compact")}</td></tr>`;
        }),
      )}</section>`;
    })
    .join("");
  return `${title(t("tagline"), filter === "all" ? t("marketTitle") : t(filter), selected ? t(selected[2]) : t("marketDescription"))}${pausedBanner(g)}${macro ? `<div class="metrics four market-macro">${card(t("policyRate"), percent(macro.policyRate))}${card(t("inflation"), percent(macro.inflation))}${card(t("economicGrowth"), percent(macro.growth))}${card(t("confidence"), percent(macro.confidence))}</div>` : ""}${overview}<div class="market-toolbar"><div class="filter-row"><button class="filter-chip ${filter === "all" ? "selected" : ""}" data-filter="all">${t("marketOverview")}</button>${filter === "commodities" ? ["all", "energy", "metals", "agriculture"].map((id) => `<button class="filter-chip ${subfilter === id ? "selected" : ""}" data-subfilter="${id}">${t(id)}</button>`).join("") : ""}${pill(t(g.economy || "expansion"), "success")}</div><div class="market-search-controls">${field(t("searchAssets"), `<input id="market-search" type="search" value="${E(state.marketSearch || "")}" placeholder="${t("searchAssets")}" autocomplete="off">`)}${field(
    t("sortBy"),
    select(
      "market-sort",
      [
        ["name", t("sortName")],
        ["change", t("sortChange")],
        ["price", t("sortPrice")],
      ],
      state.marketSort || "name",
      'id="market-sort"',
    ),
  )}</div></div>${sections || empty(t("noAssets"))}`;
}
export function portfolio(state) {
  const { game: g, summary: s } = state.session,
    holdings = Object.entries(g.holdings || {}).filter(
      ([, h]) => h.quantity > 0,
    );
  return `${title(t("tagline"), t("portfolioTitle"))}<div class="metrics four">${card(t("cash"), money(g.cash))}${card(t("portfolioValue"), money(s.portfolioValue))}${card(t("assetsTotal"), money(s.assets))}${card(t("netWorth"), money(s.netWorth), "", "highlight")}</div><section class="panel"><h2>${t("holding")}</h2>${
    holdings.length
      ? rowsTable(
          [
            t("asset"),
            t("quantity"),
            t("averageCost"),
            t("value"),
            t("locked"),
            t("eligible"),
            "",
          ],
          holdings.map(([id, h]) => {
            const asset = state.config.assets.find((a) => a.id === id);
            return `<tr><td>${E(text(asset?.name || id))}</td><td>${number(h.quantity)}</td><td>${money(h.averageCost)}</td><td>${money(orderValue(asset, h.quantity, g.prices[id]))}</td><td>${number(h.lockedQuantity)}</td><td>${number(Math.max(0, h.quantity - h.lockedQuantity))}</td><td>${button(t("trade"), `data-trade="${id}"`, "secondary compact")}</td></tr>`;
          }),
        )
      : empty(t("noHoldings"))
  }</section><section class="panel"><h2>${t("positions")}</h2><p class="small muted">${t("isolatedLong")}</p>${positionCards(
    state,
  )}</section><section class="panel"><h2>${t("balanceSheet")}</h2>${line(t("cash"), money(g.cash))}${line(t("savings"), money(g.savings))}${line(t("retirementBalance"), money(g.retirementBalance))}${line(t("portfolioValue"), money(s.portfolioValue))}${line(t("propertyValue"), money(s.propertyValue))}${line(t("businessValue"), money(s.businessValue))}${line(t("liabilities"), money(s.liabilities))}${line(t("netWorth"), money(s.netWorth))}</section>`;
}
export function properties(state) {
  const { game: g } = state.session;
  return `${title(t("tagline"), t("propertyTitle"), t("propertyDescription"))}${pausedBanner(g)}<h2>${t("availableProperties")}</h2><div class="three-columns">${Object.entries(
    state.config.propertyTypes,
  )
    .map(
      ([id, p]) =>
        `<article class="panel product-card"><div class="product-illustration property-${id}">${icon("property")}<span>${text(p.name)}</span></div><h2>${E(text(p.name))}</h2>${line(t("referencePrice"), money(p.value))}${line(t("rent"), money(p.rent))}${line(t("maintenance"), money(p.maintenance))}<form data-form="buy-property"><input type="hidden" name="propertyType" value="${id}"><label class="check-field"><input type="checkbox" name="financing" checked><span>${t("financing")} · ${percent(p.downPayment || 0.2)} ${getLanguage() === "zh" ? "首付" : "down"}</span></label>${button(t("buyProperty"), 'type="submit"', "secondary full-width")}</form></article>`,
    )
    .join("")}</div><section class="panel"><h2>${t("ownedProperties")}</h2>${
    g.properties?.length
      ? g.properties
          .map((p) => {
            const type = state.config.propertyTypes[p.type],
              loan = g.loans.find((l) => l.id === p.loanId);
            return `<article class="owned-row"><div class="owned-symbol">${icon("property")}</div><div class="owned-detail"><h3>${E(text(type?.name || p.type))} ${pill(p.salePending ? t("salePending") : p.occupied ? t("occupied") : t("vacant"), p.occupied ? "success" : "warning")}</h3><p>${t("value")} ${money(p.value)} · ${t("rent")} ${money(p.occupied ? type?.rent || 0 : 0)} · ${t("maintenance")} ${money(type?.maintenance)}${loan ? " · " + t("liabilities") + " " + money(loan.principal) : ""}</p></div>${!p.salePending ? actionButton(t("listSale"), "sell-property", { propertyId: p.id }, "secondary compact") : ""}</article>`;
          })
          .join("")
      : empty(t("noProperties"))
  }<p class="small muted">${t("propertySaleHint")}</p><p class="small muted">${t("tenantHint")}</p></section>`;
}
export function businesses(state) {
  const { game: g } = state.session;
  return `${title(t("tagline"), t("businessTitle"), t("businessDescription"))}${pausedBanner(g)}<h2>${t("ventures")}</h2><div class="three-columns">${Object.entries(
    state.config.businessTypes,
  )
    .map(
      ([id, b]) =>
        `<article class="panel product-card"><div class="product-illustration business-${id}">${icon("business")}<span>${E(text(b.name))}</span></div><h2>${E(text(b.name))}</h2>${line(t("startupCost"), money(b.cost))}${line(t("revenue"), money(b.revenue))}${line(t("operatingCost"), money(b.operatingCost))}${actionButton(t("startBusiness"), "start-business", { businessType: id }, "secondary full-width")}</article>`,
    )
    .join(
      "",
    )}</div><h2>${t("ownedBusinesses")}</h2>${g.businesses?.length ? g.businesses.map((b) => `<section class="panel"><div class="panel-heading"><h2>${E(text(state.config.businessTypes[b.type]?.name || b.type))}</h2>${pill(b.salePending ? t("salePending") : `${t("level")} ${b.level || 1}`)}</div><div class="metrics three">${card(t("businessCash"), money(b.cash))}${card(t("value"), money(b.value))}${card(t("revenue"), money(b.lastRevenue || 0))}</div>${!b.salePending ? `<div class="action-row">${actionButton(t("advertise"), "business-advertise", { businessId: b.id })}${actionButton(t("upgrade"), "business-upgrade", { businessId: b.id })}${actionButton(t("listSale"), "sell-business", { businessId: b.id })}</div><form class="inline-form" data-form="business-dividend"><input type="hidden" name="businessId" value="${E(b.id)}">${field(t("amount"), amount("amount", "500"))}${button(t("dividend"), 'type="submit"', "secondary")}</form>` : ""}</section>`).join("") : empty(t("noBusinesses"))}<div class="notice">${t("businessHint")}</div>`;
}
export function bank(state) {
  const { game: g } = state.session;
  return `${title(t("tagline"), t("bankTitle"), t("bankDescription"))}${pausedBanner(g)}<div class="metrics three">${card(t("cash"), money(g.cash), "", "highlight")}${card(t("savings"), money(g.savings))}${card(t("retirementBalance"), money(g.retirementBalance))}</div><div class="two-columns">${[
    ["savings", g.savings],
    ["retirement", g.retirementBalance],
  ]
    .map(
      ([id, balance]) =>
        `<section class="panel"><h2>${t(id === "savings" ? "savings" : "retirementBalance")}</h2><form data-form="transfer" class="stack-form">${field(t("amount"), amount())}${field(
          t("review"),
          select(
            "type",
            [
              [id + "-deposit", t("deposit")],
              [id + "-withdraw", t("withdraw")],
            ],
            id + "-deposit",
          ),
        )}${button(t("transfer"), 'type="submit"')}</form></section>`,
    )
    .join(
      "",
    )}</div><div class="two-columns"><section class="panel"><h2>${t("takeLoan")}</h2><form class="stack-form" data-form="take-loan">${field(t("amount"), amount("amount", "10000"))}${field(
    t("term"),
    select(
      "term",
      (state.config.settings?.loanTerms || [12, 24, 36, 60]).map((term) => [
        term,
        term,
      ]),
      60,
    ),
  )}${button(t("review"), 'type="submit"', "secondary")}</form></section><section class="panel"><h2>${t("loans")}</h2>${g.loans?.length ? g.loans.map((l) => `<div class="loan-card">${line(t("principal"), money(l.principal))}${line(t("annualRate"), percent(l.annualRate))}${line(t("term"), number(l.remainingMonths))}${l.payment ? line(t("payment"), money(l.payment)) : ""}${actionButton(t("repayLoan"), "repay-loan", { loanId: l.id }, "secondary compact")}</div>`).join("") : empty(t("noLoans"))}</section></div><div class="notice">${t("bankHint")}</div>`;
}
export function news(state) {
  const g = state.session.game;
  return `${title(t("tagline"), t("newsTitle"), t("newsDescription"))}${pausedBanner(g)}<div class="economy-stages">${["expansion", "boom", "recession", "recovery"].map((id) => `<span class="${g.economy === id ? "selected" : ""}">${g.economy === id ? "● " : ""}${t(id)}</span>`).join("")}</div><section class="panel">${g.news?.length ? g.news.map((n) => `<article class="news-article"><p class="eyebrow">${t("month")} ${g.elapsedMonths + 1} · ${t(g.economy || "recovery")}</p><h2>${E(text(n.title))}</h2><p>${E(text(n.body))}</p>${n.impact ? `<p class="small muted">${E(text(n.impact))}</p>` : ""}</article>`).join("") : empty(t("noNews"))}</section>`;
}
export function reports(state) {
  const { game: g, summary: s } = state.session,
    score = s.score || {};
  const history = (g.history || [])
    .filter((r) => r.elapsedMonths > 0)
    .slice(-24)
    .reverse();
  return `${title(t("tagline"), s.completed || s.bankrupt ? t("reportTitle") : t("progressReport"))}<div class="report-top"><section class="score-hero"><p class="eyebrow">${s.completed ? t("finalScore") : t("score")}</p><strong>${Number(score.total || 0).toFixed(2)}<small> / 100</small></strong><span>${modeLabel(g.mode)} / ${t(g.difficulty)} / ${t(g.ruleset)}</span>${pill(t(g.status), s.completed ? "success" : "")}</section><section class="panel final-position"><h2>${t("balanceSheet")}</h2>${line(t("netWorth"), money(s.netWorth))}${line(t("realWealth"), money(s.realNetWorth))}${line(t("realWealth") + " · " + t("benchmark"), money(s.realBenchmark))}${line(t("assetsTotal"), money(s.assets))}${line(t("liabilities"), money(s.liabilities))}${button(t("download"), "data-download", "secondary")}</section></div><section class="panel"><div class="panel-heading"><h2>${t("wealthJourney")}</h2><div class="chart-legend"><span>${t("netWorth")}</span><span>${t("benchmark")}</span></div></div>${wealthChart(g.history, { wealth: t("netWorth"), benchmark: t("benchmark"), age: t("age") })}<p class="small muted">${t("reportHint")}</p></section><div class="metrics four">${[
    ["wealth", "wealthScore", "60%"],
    ["risk", "riskScore", "15%"],
    ["cashFlow", "cashFlowScore", "15%"],
    ["debt", "debtScore", "10%"],
  ]
    .map(
      ([id, key, weight]) =>
        `<article class="metric"><p>${t(key)} · ${weight}</p><strong>${Number(score[id] || 0).toFixed(2)}</strong><progress max="100" value="${Number(score[id] || 0)}" aria-label="${t(key)}"></progress></article>`,
    )
    .join(
      "",
    )}</div><p class="small muted">${t("scoreHint")}</p><div class="two-columns"><section class="panel">${line(t("totalIncome"), money(s.totalIncome))}${line(t("totalExpenses"), money(s.totalExpenses))}${line(t("priceIndex"), number(s.priceIndex))}${line(t("milestone"), s.milestone ? t("reached") : t("notReached"))}</section><section class="panel">${line(t("drawdown"), percent(s.drawdown))}${line(t("liquidations"), number(s.forcedLiquidations))}${line(t("unpaidMonths"), number(s.unpaidMonths))}<p class="small muted">${t("pendingSaleReport")}</p></section></div><section class="panel"><h2>${t("monthlyHistory")}</h2>${
    history.length
      ? rowsTable(
          [
            t("month"),
            t("age"),
            t("income"),
            t("expenses"),
            t("netWorth"),
            t("realWealth"),
          ],
          history.map(
            (r) =>
              `<tr><td>${r.elapsedMonths}</td><td>${Math.floor(r.ageMonths / 12)}</td><td>${money(r.income)}</td><td>${money(r.expenses)}</td><td>${money(r.netWorth)}</td><td>${money(r.realNetWorth)}</td></tr>`,
          ),
        )
      : empty(t("none"))
  }</section>`;
}
export function leaderboard(state) {
  const { mode, difficulty } = state.leaderboardFilter;
  return `${title(t("tagline"), t("leaderboardTitle"), t("leaderboardDescription"))}<form class="filter-row" data-form="leaderboard">${field(
    t("mode"),
    select(
      "mode",
      Object.keys(state.config.modes).map((id) => [id, modeLabel(id)]),
      mode,
    ),
  )}${field(
    t("difficulty"),
    select(
      "difficulty",
      Object.keys(state.config.difficulties).map((id) => [id, t(id)]),
      difficulty,
    ),
  )}${button(t("refresh"), 'type="submit"', "secondary")}</form><section class="panel">${
    state.entries?.length
      ? rowsTable(
          [t("rank"), t("player"), t("score"), t("realWealth")],
          state.entries.map(
            (entry, i) =>
              `<tr><td><span class="rank-badge">${i + 1}</span></td><td>${E(entry.displayName)}</td><td><strong>${Number(entry.score?.total ?? entry.score ?? 0).toFixed(2)}</strong></td><td>${money(entry.realNetWorth)}</td></tr>`,
          ),
        )
      : empty(t("noScores"))
  }</section>`;
}
export function profile(state) {
  return `${title(t("tagline"), t("profileTitle"))}<section class="panel account-panel"><div class="avatar large">${E(state.user?.displayName?.slice(0, 2).toUpperCase() || "IG")}</div><div><h2>${E(state.user?.displayName || "")}</h2><p>${state.user?.guest ? t("guestAccount") : E(state.user?.email || t("localAccount"))}</p></div>${button(t("logout"), "data-logout", "secondary")}${state.user?.guest ? button(t("register"), 'data-auth="register"', "primary") : ""}</section>${state.user?.guest ? `<div class="notice">${t("guestHint")}</div>` : ""}<div class="panel-heading"><h2>${t("savedGames")}</h2>${button(t("newGame"), 'data-view="setup"', "secondary")}</div><div class="saved-grid">${state.games?.length ? state.games.map((g) => `<article class="panel saved-card"><div class="panel-heading">${icon("life")}${pill(t(g.status))}</div><h2>${modeLabel(g.mode)}</h2><p>${t(g.difficulty)} · ${t(g.ruleset)}</p><p>${t("age")} ${Math.floor(g.ageMonths / 12)}</p>${button(t("load"), `data-load="${E(g.id)}"`, "secondary full-width")}</article>`).join("") : empty(t("noGames"))}</div>`;
}
export function more(state) {
  return `${title(t("tagline"), t("more"))}<div class="more-grid">${["property", "business", "bank", "report", "leaderboard", "profile", "help"].map((id) => navButton(id, state.view)).join("")}</div>`;
}
export function help() {
  return `${title(t("tagline"), t("helpTitle"))}<div class="two-columns"><section class="panel"><h2>${t("help")}</h2><p class="preserve-lines">${t("helpSteps")}</p></section><section class="panel"><h2>${t("ruleset")}</h2><p>${t("helpRules")}</p><p>${t("lockHint")}</p><p>${t("leverageHint")}</p></section></div><section class="panel"><h2>${t("diversify")}</h2><p>${t("diversifyHint")}</p></section>`;
}
export function authDialog(mode = "login") {
  return `<form class="auth-form" id="auth-form"><p class="eyebrow">${t("tagline")}</p><h2>${t(mode === "register" ? "register" : "signin")}</h2>${mode === "register" ? field(t("displayName"), input("displayName", "", 'required minlength="2" maxlength="40" autocomplete="nickname"')) : ""}${field(t("email"), input("email", "", 'type="email" required maxlength="254" autocomplete="email"'))}${field(t("password"), input("password", "", 'type="password" required minlength="8" maxlength="128" autocomplete="' + (mode === "register" ? "new-password" : "current-password") + '"'))}<p class="small muted">${t("accountHint")}</p><p id="dialog-error" class="negative" role="alert"></p>${button(t(mode === "register" ? "register" : "signin"), 'type="submit"', "primary full-width")}<div class="auth-alternatives"><button type="button" class="text-button" data-switch-auth="${mode === "register" ? "login" : "register"}">${t(mode === "register" ? "signin" : "register")}</button><button type="button" class="text-button" data-guest>${t("guest")}</button></div></form>`;
}
export function tradeDialog(state, assetId) {
  const a = state.config.assets.find((a) => a.id === assetId),
    g = state.session.game,
    h = g.holdings[assetId] || { quantity: 0, lockedQuantity: 0 },
    step = a.quantityStep || (a.category === "crypto" ? 0.01 : 1),
    metrics = g.assetMetrics?.[assetId],
    history = g.priceHistory?.[assetId] || [
      { month: g.marketMonth, price: g.prices[assetId] },
    ];
  const risk = a.risk || (a.category === "crypto" ? "very-high" : "high");
  return `<div class="instrument-dialog"><section class="instrument-analysis"><p class="eyebrow">${E(a.symbol)} · ${E(text(a.sector || a.name))}</p><h2>${E(text(a.name))}</h2><div class="trade-price">${money(g.prices[assetId])}</div><p class="small muted">${t("price")} / ${E(text(a.unit || t("unitUnits")))}</p><h3>${t("priceHistory")}</h3>${priceChart(history, t("priceHistory"))}<div class="instrument-facts">${line(t("risk"), typeof risk === "object" ? E(text(risk)) : t(risk))}${line(t("minOrder"), `${step} ${a.category === "crypto" ? E(a.symbol) : E(text(a.unit || t("unitUnits")))}`)}${metrics ? `${line(t("volatility"), percent(metrics.volatility))}${line(t("valuation"), `${number(metrics.valuation)}×`)}${line(t("trend"), percent(metrics.trend))}` : ""}</div><p class="small muted">${t("lockHint")}</p><p class="small muted">${t("leverageHint")}</p></section><form id="trade-form" class="stack-form"><h2>${t("reviewTrade")}</h2>${line(t("holding"), number(h.quantity))}${line(t("locked"), number(h.lockedQuantity))}${line(t("eligible"), number(Math.max(0, h.quantity - h.lockedQuantity)))}<input type="hidden" name="assetId" value="${assetId}">${field(
    t("trade"),
    select(
      "side",
      [
        ["buy", t("buy")],
        ["sell", t("sell")],
      ],
      "buy",
    ),
  )}${field(t("quantity"), numeric("quantity", a.category === "crypto" ? "0.01" : "10", step))}${field(
    t("leverage"),
    select(
      "leverage",
      Array.from({ length: a.maxLeverage || 2 }, (_, i) => [
        i + 1,
        i === 0 ? t("spot") : `${i + 1}×`,
      ]),
      1,
    ),
  )}<div id="trade-quote" class="quote-box"></div><p id="dialog-error" class="negative" role="alert"></p>${button(t("confirm"), 'type="submit"', "primary full-width")}</form></div>`;
}

export function positionCards(state) {
  const g = state.session.game,
    settings = state.config.settings || {};
  const cards = (g.positions || [])
    .map((p) => {
      const a = state.config.assets.find((a) => a.id === p.assetId),
        m = positionMetrics(
          a,
          p,
          g.prices[p.assetId],
          settings.liquidationEquityRatio ?? 0.15,
        ),
        locked = g.marketMonth < p.lockedUntilMonth,
        ended = ["completed", "bankrupt"].includes(g.status);
      return `<article class="position-card" data-position="${E(p.id)}"><div class="panel-heading"><div><strong>${E(text(a.name))}</strong><p class="small muted">${p.leverage}× · ${t("isolatedLong")} · ${number(p.quantity)} ${E(a.symbol)}</p></div>${pill(t(locked ? "lockedPosition" : m.risk), m.risk === "danger" || m.risk === "liquidating" ? "negative" : "")}</div><div class="position-facts">${line(t("entryPrice"), money(p.entryPrice))}${line(t("markPrice"), money(g.prices[p.assetId]))}${line(t("margin"), money(p.margin))}${line(t("exposure"), money(m.exposure))}${line(t("equity"), money(m.equity))}${line(t("unrealizedPnl"), `<span class="${m.pnl >= 0 ? "positive" : "negative"}">${money(m.pnl)} (${percent(m.roi)})</span>`)}${line(t("liquidationPrice"), m.liquidationPrice === null ? "—" : money(m.liquidationPrice))}</div><p class="small muted">${t("liquidationHint")}</p>${button(t("closePosition"), `data-close-position="${E(p.id)}" data-locked="${locked}" ${locked || ended ? "disabled" : ""}`, "secondary full-width")}</article>`;
    })
    .join("");
  const history = (g.positionHistory || []).slice(-12).reverse();
  return (
    (cards ? `<div class="position-grid">${cards}</div>` : empty(t("none"))) +
    (history.length
      ? `<h3>${t("tradeHistory")}</h3>${rowsTable(
          [
            t("asset"),
            t("months"),
            t("quantity"),
            t("trade"),
            t("closedPnl"),
            t("closeProceeds"),
          ],
          history.map(
            (h) =>
              `<tr><td>${E(text(state.config.assets.find((a) => a.id === h.assetId)?.name || h.assetId))}</td><td>${h.month}</td><td>${number(h.quantity)}</td><td>${t(h.kind === "forced" ? "forcedClose" : "manualClose")}</td><td class="${h.pnl - h.fee >= 0 ? "positive" : "negative"}">${money(h.pnl - h.fee)}</td><td>${money(h.proceeds)}</td></tr>`,
          ),
        )}`
      : "")
  );
}
export function closePositionDialog(state, positionId) {
  const g = state.session.game,
    p = g.positions.find((p) => p.id === positionId),
    a = state.config.assets.find((a) => a.id === p.assetId);
  return `<form id="close-position-form" class="stack-form"><p class="eyebrow">${E(text(a.name))} · ${p.leverage}×</p><h2>${t("closePreview")}</h2><input type="hidden" name="positionId" value="${E(p.id)}">${line(t("holding"), number(p.quantity))}${field(t("closeQuantity"), `<input type="number" name="quantity" value="${p.quantity}" min="${a.quantityStep || 1}" max="${p.quantity}" step="${a.quantityStep || 1}" required>`)}${button(t("allQuantity"), 'type="button" data-close-all', "secondary compact")}<div id="close-quote" class="quote-box" aria-live="polite"></div><p id="dialog-error" class="negative" role="alert"></p>${button(t("confirm"), 'type="submit"', "primary full-width")}</form>`;
}

export const pages = {
  home,
  setup,
  life,
  market,
  assets: portfolio,
  property: properties,
  business: businesses,
  bank,
  news,
  report: reports,
  leaderboard,
  profile,
  more,
  help,
};
