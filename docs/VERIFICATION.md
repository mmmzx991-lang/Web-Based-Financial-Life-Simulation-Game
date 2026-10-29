# Verification record 30 October 2026

Verified for the bilingual v0.2 implementation on Windows with Node.js24 and installed Microsoft Edge/Chromium.

- Syntax check: 26 JavaScript source, script and test files passed.
- Native test runner: 47 tests passed, zero failures. Includes exact openings, every Easy-mode endpoint, salary/expense/retirement boundaries, trading lock, monthly equivalence, public price reproducibility, margin cap, amortization, tenancy and sales timing, business accounting, bill recovery/extension/bankruptcy, sessions, account isolation, same-request replay, restart, CSV localization and UI regressions.
- Real browser: English and Simplified Chinese; desktop1440×1000 and mobile390×844; no page-level horizontal overflow in each mobile view. Exercised guest setup, trading with deliberate same-month sale rejection, leverage quote roundtrip, deposit, business startup, required event, account upgrade, reload, switching to a separate empty account, Chinese CSV download, a276-month Standard completion and leaderboard eligibility. No unexpected console or JavaScript errors.
- Short local load exercise:20 independent registered accounts, each advances12 months;140 HTTP requests. Measured728ms total,144ms request p95,180ms maximum on the verification machine. Timing varies by hardware. This does not establish sustained production capacity.
- Independent review found and resolved three important correctness issues: terminal-history accounting after an extension, clearing private state when switching identities, and the buy/sell leverage quote state. Business actual monthly metrics were also added and checked.
- Windows local service: http://127.0.0.1:4173/ returned200 and /api/health returned `{status:"ok",version:2}` after the old process was replaced. Local data files were preserved; anonymous v1 saves are intentionally not imported into v2 accounts.

Remaining verification work before a production/academic acceptance claim: real user feedback, sustained load testing, balancing research, deployment configuration and production security/backup review. This record reports observed engineering checks, not completed external acceptance.
