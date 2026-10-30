# Verification record 30 October 2026

Verified bilingual v0.3.1 on Windows with Node.js 24 and Microsoft Edge/Chromium.

- Syntax: 32 JavaScript source, script and test files passed.
- Native tests: 86 passed, zero failures. Includes integer-sen accounting for 0.01-coin orders, fractional locks/partial sales/leverage, market replay after serialization, macro transmission, volatility clustering, correlated shocks, persistent news, business inflation/diminishing upgrades, legacy compatibility, account ownership and current-model leaderboard isolation.
- Browser: desktop 1440x1000 and mobile 390x844; English and Chinese; crypto 0.01 buy/unlock/sell, market categories/commodity subgroups/search/sort, instrument detail dialog, all mobile pages without horizontal overflow, account upgrade/reload, localized CSV, and a real 276-month Standard completion into the leaderboard. No unexpected browser errors. Screenshots were inspected for market and desktop/mobile crypto details.
- Short load exercise: 20 independent players, 12 months each, 140 requests; measured 1,457 ms total, 399 ms p95 and 401 ms maximum. This checks a short local workload, not sustained production capacity.
- Independent core review found no Important/Critical blocker. Targeted legacy differential probes compared complete state against the previous commit through 70 advances in all four life modes, including ETH trades and business operations: 294 comparisons matched.
- Market inspection: 100 seeds x 696 months avoided the floor and former upper clamp; details and limitations are in MARKET-MODEL.md. No claim of completed economic balancing research.

New games use marketVersion 3. Existing saves retain their marketVersion 2 behavior and remain playable; legacy scores are excluded from the current leaderboard. Save/API version stays 2. Tests use temporary data and do not modify player saves.

Remaining: external user acceptance, sustained production load, economic balancing research and deployment/backup/security review.

Leverage refinement: verified 3x fractional crypto opening with a separate margin/fee preview; next-month locked/unlocked controls; desktop partial close of 0.01 from 0.03 and mobile Chinese full close of the remaining 0.02. Inspected desktop position and mobile close-preview screenshots. Native regressions cover split conservation across prices, serialization/next-price accounting, invalid quantities, tiny residual margin, exact liquidation boundary, positive-equity forced closure and old-position forced fees. Entry fee remains separate from displayed P&L after exit fee.
