# Bilingual Investment Game Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or executing-plans; implement and verify task by task.

Goal: turn the scaffold into a playable, bilingual educational game aligned with the supplied CAT404 proposal, while documenting configurable balancing assumptions.

Architecture: preserve native Node.js HTTP and plain ES-module frontend. Pure simulation transitions own financial rules; an account-aware file repository owns persistence and idempotency. A responsive app renders the same saved state in English or Simplified Chinese. Reuse the current checkout and existing repository.

Global constraints: four modes 22–80 / 22–45 / 45–60 / 60–80; four proposal difficulty openings; retirement at 60; annual salary growth 2.5%; fixed expenses RM2000 / RM3000 / RM2500 at ages 45 and 60; 1/3 month steps using identical monthly settlement; exactly 15 proposal assets; ownership-based income; no double counting; one-time event effects and retry-safe settlement; completed Standard games only on category leaderboard; Free results private. No real market/API/AI calls. Money is integer sen. Parameters absent from proposal (fees, event probabilities, business prices, inflation, return distributions) must be explicit configurable educational assumptions.

- [x] Core: exact openings, lock rules, leverage, loans and transfers, monthly equivalence, retirement, sales, tenancy, unpaid bill pause/extension/bankruptcy, reports and seeded price paths. Focused modules under server/core and tests/core*.test.js.
- [x] API: account isolation, password hashing, cookies, autosave/restart, request replay and leaderboard filtering. server/auth.js, store.js, app.js and tests/api.test.js against CONTRACT.md.
- [x] UI: bilingual setup, dashboard, markets, holdings, properties, business, banking, news, history, score, leaderboard and account views. Navy/teal/ivory, mobile navigation, visible pause states and accessible forms. Real-browser checks in both languages and desktop/mobile widths.
- [x] Integration: syntax,47tests and20-account exercise; independent review fixes; README/API/proposal mapping; verified updated Windows server and opened game. Repository synchronization is the final release action.
