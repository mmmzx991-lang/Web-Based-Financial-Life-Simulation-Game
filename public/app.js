import { positionMetrics, closeQuote } from "./leverage-math.js";
import { orderValue } from "./order-math.js";
import { t, setLanguage, getLanguage, text, money, errorText } from "./i18n.js";
import {
  pages,
  shell,
  authDialog,
  tradeDialog,
  closePositionDialog,
  escape,
} from "./views.js";
import { exportReport } from "./export-report.js";
import { switchUser } from "./account-state.js";
const state = {
  user: null,
  config: null,
  session: null,
  view: "home",
  games: [],
  entries: [],
  selection: { mode: "full-life", difficulty: "normal", ruleset: "standard" },
  leaderboardFilter: { mode: "full-life", difficulty: "normal" },
  marketFilter: "all",
  marketSubfilter: "all",
  marketSearch: "",
  marketSort: "name",
  busy: false,
};
const root = document.getElementById("app"),
  dialog = document.getElementById("dialog"),
  dialogBody = document.getElementById("dialog-body");
function setUser(user) {
  if (switchUser(state, user)) localStorage.removeItem("investment-last-game");
}
let authMode = "login",
  dialogType = "",
  dialogAsset = "",
  confirmResolver;
setLanguage(getLanguage());
async function api(path, method = "GET", body) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error("Server response could not be read");
  }
  if (!response.ok) {
    const e = new Error(value.error || "Request failed");
    e.status = response.status;
    e.code = value.code;
    throw e;
  }
  return value;
}
function toast(message, error = false) {
  const node = document.getElementById("toast");
  node.textContent = message;
  node.classList.toggle("error", error);
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (node.hidden = true), error ? 10000 : 4500);
}
function render() {
  if (!state.config) return;
  root.innerHTML = shell(state, (pages[state.view] || pages.home)(state));
  document.title = t("brand");
  document
    .getElementById("dialog-close")
    .setAttribute("aria-label", t("close"));
  document.getElementById("skip-link").textContent =
    getLanguage() === "zh" ? "跳到主要内容" : "Skip to content";
  const ended =
    state.session &&
    ["completed", "bankrupt"].includes(state.session.game.status);
  document
    .querySelectorAll(
      "[data-action],[data-trade],[data-close-position],[data-start-game],[data-load]",
    )
    .forEach(
      (b) =>
        (b.disabled =
          state.busy ||
          (ended &&
            (b.hasAttribute("data-action") ||
              b.hasAttribute("data-trade") ||
              b.hasAttribute("data-close-position"))) ||
          b.dataset.locked === "true"),
    );
  document
    .querySelectorAll('form[data-form] button[type="submit"]')
    .forEach(
      (b) =>
        (b.disabled = state.busy || (ended && state.view !== "leaderboard")),
    );
  if (state.busy) root.setAttribute("aria-busy", "true");
  else root.removeAttribute("aria-busy");
}
async function work(task, { modal = false } = {}) {
  if (state.busy) return;
  state.busy = true;
  render();
  dialog
    .querySelectorAll('button[type="submit"]')
    .forEach((b) => (b.disabled = true));
  try {
    await task();
  } catch (e) {
    const target =
      modal && dialog.open ? document.getElementById("dialog-error") : null;
    if (target) target.textContent = errorText(e);
    else toast(errorText(e), true);
    if (e.status === 401) {
      state.user = null;
      state.session = null;
      state.view = "home";
    }
  } finally {
    state.busy = false;
    render();
    dialog
      .querySelectorAll('button[type="submit"]')
      .forEach((b) => (b.disabled = false));
  }
}
function openDialog(content, type) {
  dialog.classList.toggle("trade-dialog", type === "trade");
  dialogBody.innerHTML = content;
  dialogType = type;
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() =>
    dialog.querySelector('input:not([type="hidden"]),button')?.focus(),
  );
}
function closeDialog() {
  dialog.close();
  dialogType = "";
  if (confirmResolver) {
    confirmResolver(false);
    confirmResolver = null;
  }
}
document.getElementById("dialog-close").onclick = closeDialog;
dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeDialog();
});
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) closeDialog();
});
function confirmDecision(message) {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    openDialog(
      `<p class="eyebrow">${t("review")}</p><h2>${t("confirm")}</h2><p>${escape(message)}</p><div class="action-row"><button class="button secondary" data-confirm="no">${t("cancel")}</button><button class="button primary" data-confirm="yes">${t("confirm")}</button></div>`,
      "confirm",
    );
  });
}
async function loadGames() {
  if (state.user) state.games = (await api("/api/games")).games;
}
async function loadGame(id) {
  state.session = await api("/api/games/" + id);
  localStorage.setItem("investment-last-game", id);
}
async function loadLeaderboard() {
  const { mode, difficulty } = state.leaderboardFilter;
  state.entries = (
    await api(
      `/api/leaderboard?mode=${encodeURIComponent(mode)}&difficulty=${encodeURIComponent(difficulty)}`,
    )
  ).entries;
}
async function navigate(view) {
  const privateView = !["home", "setup", "help", "leaderboard"].includes(view);
  if (privateView && !state.user) {
    authMode = "login";
    openDialog(authDialog(authMode), "auth");
    return;
  }
  if (privateView && !state.session && view !== "profile") {
    state.view = "setup";
    return;
  }
  if (view === "profile") await loadGames();
  if (view === "leaderboard") await loadLeaderboard();
  state.view = view;
  window.scrollTo({ top: 0, behavior: "instant" });
}
function sen(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1e9)
    throw new Error("Invalid amount");
  return Math.round(n * 100);
}
async function act(action) {
  const id = state.session?.id;
  if (!id) throw new Error("Sign in and start a game");
  const key = `investment-pending-${id}`,
    fingerprint = JSON.stringify(action);
  let pending;
  try {
    pending = JSON.parse(localStorage.getItem(key) || "null");
  } catch {}
  if (!pending || pending.fingerprint !== fingerprint)
    pending = { fingerprint, requestId: crypto.randomUUID() };
  localStorage.setItem(key, JSON.stringify(pending));
  try {
    state.session = await api(`/api/games/${id}/action`, "POST", {
      requestId: pending.requestId,
      action,
    });
    localStorage.removeItem(key);
    toast(t("saved"));
    if (["completed", "bankrupt"].includes(state.session.game.status))
      state.view = "report";
  } catch (e) {
    if (e.status) localStorage.removeItem(key);
    throw e;
  }
}
async function begin() {
  if (!state.user) setUser((await api("/api/auth/guest", "POST", {})).user);
  state.session = await api("/api/games", "POST", state.selection);
  localStorage.setItem("investment-last-game", state.session.id);
  state.view = "life";
  toast(t("welcome"));
}
function updateQuote() {
  const form = document.getElementById("trade-form");
  if (!form) return;
  form.elements.leverage.disabled = form.elements.side.value === "sell";
  const data = new FormData(form),
    g = state.session.game,
    q = Math.max(0, Number(data.get("quantity")) || 0),
    leverage = Number(data.get("leverage")) || 1,
    side = data.get("side");
  const asset = state.config.assets.find((a) => a.id === dialogAsset);
  const value = orderValue(asset, q, g.prices[dialogAsset]),
    fee = Math.max(1, Math.round(value * (state.config.tradeFeeRate ?? 0.002)));
  const row = (label, value) =>
    `<div class="detail-row"><span>${t(label)}</span><strong>${value}</strong></div>`;
  const margin = Math.max(1, Math.round(value / leverage));
  let detail = row("tradeValue", money(value));
  if (side === "buy" && leverage > 1) {
    const p = {
        assetId: asset.id,
        quantity: q,
        entryPrice: g.prices[dialogAsset],
        margin,
      },
      m = positionMetrics(asset, p, p.entryPrice);
    detail +=
      row("entryMargin", money(margin)) +
      row("maxLoss", money(margin)) +
      row(
        "liquidationPrice",
        m.liquidationPrice === null ? "—" : money(m.liquidationPrice),
      );
    detail += row(
      "pnlScenario",
      `−10%: ${money(-Math.min(margin, orderValue(asset, q, Math.round(p.entryPrice * 0.1))))} / +10%: ${money(orderValue(asset, q, Math.round(p.entryPrice * 0.1)))}`,
    );
    detail += `<p class="small muted">${t("liquidationHint")}</p>`;
  }
  detail +=
    row("transactionFee", money(fee)) +
    row(
      side === "buy" ? "cashRequired" : "cash",
      money(side === "buy" ? margin + fee : Math.max(0, value - fee)),
    );
  if (side === "buy" && margin + fee > g.cash)
    detail += `<p class="negative">${t("cashShort")}</p>`;
  document.getElementById("trade-quote").innerHTML = detail;
}

function updateCloseQuote() {
  const form = document.getElementById("close-position-form");
  if (!form) return;
  const g = state.session.game,
    p = g.positions.find((p) => p.id === form.elements.positionId.value),
    a = state.config.assets.find((a) => a.id === p.assetId);
  const row = (key, value) =>
    `<div class="detail-row"><span>${t(key)}</span><strong>${value}</strong></div>`;
  try {
    const q = closeQuote(
      a,
      p,
      g.prices[p.assetId],
      Number(form.elements.quantity.value),
      state.config.tradeFeeRate ?? 0.002,
    );
    document.getElementById("close-quote").innerHTML =
      row("marginReleased", money(q.margin)) +
      row("grossEquity", money(q.equity)) +
      row("closedPnl", money(q.pnl - q.fee)) +
      row("transactionFee", money(q.fee)) +
      row("remainingQuantity", String(q.remaining?.quantity || 0)) +
      row("closeProceeds", money(q.proceeds));
    document.getElementById("dialog-error").textContent = "";
    form.querySelector('[type="submit"]').disabled = state.busy;
  } catch {
    document.getElementById("close-quote").innerHTML = "";
    document.getElementById("dialog-error").textContent = t("closeInvalid");
    form.querySelector('[type="submit"]').disabled = true;
  }
}

function actionFromElement(el) {
  const action = { type: el.dataset.action };
  for (const [key, value] of Object.entries(el.dataset)) {
    if (key !== "action")
      action[key] = key === "months" ? Number(value) : value;
  }
  return action;
}
function quote(a) {
  const g = state.session.game,
    c = state.config,
    settings = c.settings || {};
  if (a.type === "declare-bankruptcy") return t("confirmBankruptcy");
  if (a.type === "start-business") {
    const b = c.businessTypes[a.businessType];
    return `${text(b.name)} · ${t("startupCost")}: ${money(b.cost)}. ${t("confirmMoney")}`;
  }
  if (a.type === "buy-property") {
    const p = c.propertyTypes[a.propertyType];
    return `${text(p.name)} · ${t("value")}: ${money(p.value)}. ${t("cash")}: ${money(a.financing ? p.value * p.downPayment : p.value)}. ${a.financing ? `${t("annualRate")} ${p.annualRate * 100}% · ${p.term} ${t("months")}. ` : ""}${t("propertySaleHint")}`;
  }
  if (["sell-property", "sell-business"].includes(a.type))
    return t("propertySaleHint");
  if (a.type === "extend-bill")
    return `${t("extendBill")} · ${money(settings.extensionFee ?? 5000)}. ${t("billHint")}`;
  if (["business-advertise", "business-upgrade"].includes(a.type)) {
    const b = g.businesses.find((b) => b.id === a.businessId),
      type = c.businessTypes[b.type];
    return `${t(a.type === "business-advertise" ? "advertise" : "upgrade")} · ${money(type[a.type === "business-advertise" ? "advertisingCost" : "upgradeCost"] * (a.type === "business-upgrade" ? b.level : 1))}. ${t("businessHint")}`;
  }
  if (a.type === "take-loan") {
    const rate = (settings.personalLoanRate ?? 0.075) / 12,
      payment = Math.round((a.amount * rate) / (1 - (1 + rate) ** -a.term));
    return `${t("takeLoan")}: ${money(a.amount)} · ${a.term} ${t("months")} · ${t("annualRate")} ${(settings.personalLoanRate ?? 0.075) * 100}% · ${t("payment")}: ${money(payment)}. ${t("bankHint")}`;
  }
  if (a.type === "repay-loan")
    return `${t("repayLoan")}: ${money(g.loans.find((l) => l.id === a.loanId)?.principal)}. ${t("bankHint")}`;
  if (a.type === "business-dividend")
    return `${t("dividend")}: ${money(a.amount)}. ${t("businessHint")}`;
  if (a.type === "close-position")
    return t("lockHint") + " " + t("positionEquity");
  return null;
}
async function perform(action) {
  const message = quote(action);
  if (message && !(await confirmDecision(message))) return;
  await work(() => act(action));
}
document.addEventListener("click", async (e) => {
  const el = e.target.closest("button,[data-view]");
  if (!el || el.disabled) return;
  if (el.dataset.confirm) {
    const resolve = confirmResolver;
    confirmResolver = null;
    dialog.close();
    resolve?.(el.dataset.confirm === "yes");
    return;
  }
  if (el.dataset.language) {
    setLanguage(el.dataset.language);
    render();
    return;
  }
  if (el.dataset.auth || el.dataset.switchAuth) {
    authMode = el.dataset.auth || el.dataset.switchAuth;
    openDialog(authDialog(authMode), "auth");
    return;
  }
  if (el.hasAttribute("data-guest")) {
    await work(
      async () => {
        setUser((await api("/api/auth/guest", "POST", {})).user);
        closeDialog();
        state.view = "setup";
      },
      { modal: true },
    );
    return;
  }
  if (el.dataset.view) {
    await work(() => navigate(el.dataset.view));
    return;
  }
  for (const key of ["mode", "difficulty", "ruleset"])
    if (el.dataset[key]) {
      state.selection[key] = el.dataset[key];
      render();
      return;
    }
  if (el.dataset.filter || el.dataset.marketGroup) {
    state.marketFilter = el.dataset.filter || el.dataset.marketGroup;
    state.marketSubfilter = "all";
    state.marketSearch = "";
    render();
    return;
  }
  if (el.dataset.subfilter) {
    state.marketSubfilter = el.dataset.subfilter;
    render();
    return;
  }
  if (el.hasAttribute("data-start-game")) {
    await work(begin);
    return;
  }
  if (el.dataset.load) {
    await work(async () => {
      await loadGame(el.dataset.load);
      state.view = "life";
    });
    return;
  }
  if (el.dataset.closePosition) {
    openDialog(
      closePositionDialog(state, el.dataset.closePosition),
      "close-position",
    );
    updateCloseQuote();
    return;
  }
  if (el.hasAttribute("data-close-all")) {
    const form = document.getElementById("close-position-form");
    form.elements.quantity.value = form.elements.quantity.max;
    updateCloseQuote();
    return;
  }
  if (el.dataset.trade) {
    dialogAsset = el.dataset.trade;
    openDialog(tradeDialog(state, dialogAsset), "trade");
    updateQuote();
    return;
  }
  if (el.dataset.action) {
    await perform(actionFromElement(el));
    return;
  }
  if (el.hasAttribute("data-logout")) {
    await work(async () => {
      await api("/api/auth/logout", "POST", {});
      state.user = null;
      state.session = null;
      state.games = [];
      state.view = "home";
      localStorage.removeItem("investment-last-game");
    });
    return;
  }
  if (el.hasAttribute("data-download"))
    await work(async () => {
      const report = await api(`/api/games/${state.session.id}/report`),
        g = state.session.game;
      const url = URL.createObjectURL(
        new Blob([exportReport(g, report)], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `investment-game-${g.mode}-${getLanguage()}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
});
dialog.addEventListener("input", () => {
  if (dialogType === "trade") updateQuote();
  if (dialogType === "close-position") updateCloseQuote();
});
document.addEventListener("input", (event) => {
  if (event.target.id !== "market-search") return;
  const value = event.target.value,
    start = event.target.selectionStart;
  state.marketSearch = value;
  render();
  const search = document.getElementById("market-search");
  search.focus();
  search.setSelectionRange(start, start);
});
document.addEventListener("change", (event) => {
  if (event.target.id === "market-sort") {
    state.marketSort = event.target.value;
    render();
  }
});
document.addEventListener("submit", async (e) => {
  const form = e.target;
  e.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  if (form.id === "auth-form") {
    await work(
      async () => {
        setUser(
          (
            await api(
              "/api/auth/" + (authMode === "register" ? "register" : "login"),
              "POST",
              values,
            )
          ).user,
        );
        closeDialog();
        await loadGames();
        if (state.games.length) {
          await loadGame(state.games[0].id);
          state.view = "life";
        } else state.view = "setup";
        toast(t("welcome"));
      },
      { modal: true },
    );
    return;
  }
  if (form.id === "close-position-form") {
    await work(
      async () => {
        await act({
          type: "close-position",
          positionId: values.positionId,
          quantity: Number(values.quantity),
        });
        closeDialog();
      },
      { modal: true },
    );
    return;
  }
  if (form.id === "trade-form") {
    await work(
      async () => {
        await act({
          type: "trade",
          assetId: values.assetId,
          side: values.side,
          quantity: Number(values.quantity),
          leverage: values.side === "sell" ? 1 : Number(values.leverage),
        });
        closeDialog();
      },
      { modal: true },
    );
    return;
  }
  const type = form.dataset.form;
  if (!type) return;
  try {
    if (type === "leaderboard") {
      state.leaderboardFilter = {
        mode: values.mode,
        difficulty: values.difficulty,
      };
      await work(loadLeaderboard);
      return;
    }
    let action = { type, ...values };
    if (type === "transfer")
      action = { type: values.type, amount: sen(values.amount) };
    if (type === "take-loan")
      action = { type, amount: sen(values.amount), term: Number(values.term) };
    if (type === "buy-property")
      action = {
        type,
        propertyType: values.propertyType,
        financing: values.financing === "on",
      };
    if (type === "business-dividend")
      action = {
        type,
        businessId: values.businessId,
        amount: sen(values.amount),
      };
    await perform(action);
  } catch (error) {
    toast(errorText(error), true);
  }
});
async function boot() {
  try {
    state.config = await api("/api/config");
    state.user = (await api("/api/auth/me")).user;
    if (state.user) {
      await loadGames();
      const previous = localStorage.getItem("investment-last-game"),
        saved = state.games.find((g) => g.id === previous) || state.games[0];
      if (saved) {
        await loadGame(saved.id);
        state.view = "life";
      }
    }
    render();
  } catch (error) {
    root.innerHTML = `<main class="startup-error"><h1>${t("brand")}</h1><p role="alert">${escape(errorText(error))}</p><button class="button primary" id="reload">${t("refresh")}</button></main>`;
    document.getElementById("reload").onclick = () => location.reload();
  }
}
boot();
