# Proposal implementation mapping

Source: the CAT404 proposal supplied on 30 October 2026. This is an implementation mapping, not a claim of academic acceptance or completed user evaluation.

| Section | Behavior in v0.3 |
| --- | --- |
| 5.1 modes | Exact four age windows and total months; endpoint excludes extra salary/bills |
| 5.2 starting finances | Exact difficulty cash/salary; later salary compounding; no initial investments |
| 5.3 costs/property | Exact fixed living budgets, opening occupied properties and Expert retirement mortgage; no Full Life resets |
| 5.4 monthly loop | Identical one/three month procedure, pauses and saved remaining months |
| 5.5 investments | Exact category counts, monthly prices, one fee, locked new holdings, long-only 2×/3× capped-margin leverage |
| 5.6 economy/news | Four phases, 60 prepared bilingual templates, once-per-month effects, action-independent Standard path |
| 5.7 property/business | Occupancy/rent/search, next-settlement sales, mortgages, retained business cash, distributions, ads/upgrades |
| 5.8 bank/career | Savings, amortized loans, retirement transfers, salary changes/bonus; salary stops at 60 |
| 5.9 difficulty | One bill liability per month, no duplicate income/charge on restore, one extension fee, bankruptcy report |
| 5.10 records/report | Opening + closing snapshots, nominal/real chart, benchmark, balances, cashflow and CSV export |
| 5.11 score/leaderboard | Exact weighted formulas with caps; one best completed Standard score per mode/difficulty, Free private |
| 5.12 web/account/save | Independent local accounts/guests, hashed passwords, durable sessions, atomic autosave and request replay |
| 5.13 verification | Core/API/view regressions, real browser full run, 20-account short concurrent exercise |
| UI revision | Navy/teal/ivory, separate readable labels, original isometric SVG world, desktop/sidebar and phone/bottom navigation; English/Chinese switch |

Balance details absent from the proposal are explicit in config and CORE-NOTES. Stock names are fictional implementation choices. The benchmark earns conservative interest on positive cash and keeps opening properties occupied. Required event pauses currently use career reviews; property vacancy changes are recorded automatically. Free varies the scenario and stores private results, with no custom rule editor. Crypto orders use 0.01-coin increments; other assets use whole units. The v3 market adds persistent macro factors, correlated shocks, variable regimes and valuation reversion; see MARKET-MODEL.md. These are transparent simplifications for the educational MVP.

Still outside this delivery: sustained production load tests, external deployment/HTTPS/backups, email verification/password reset, real user study, economic balancing research and university acceptance testing. No real data feeds or payments are connected. Legacy anonymous v1 saves are not migrated.
