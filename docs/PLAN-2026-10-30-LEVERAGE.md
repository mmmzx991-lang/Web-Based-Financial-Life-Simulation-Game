# Leverage trading refinement plan — 2026-10-30

Scope: complete the existing isolated long-only monthly leverage experience, retaining proposal caps (2x ordinary assets, 3x crypto), next-month voluntary unlock, and losses capped at position margin. No shorts, derivatives exchange, live prices or funding charges.

- [x] Add regression tests for partial close conservation, exact crypto steps, no zero-margin remnants, loss caps, immutable state and lock validation.
- [x] Centralize pure position metrics and close quotes for browser and server. Include integer-sen equity/P&L, ROI, estimated liquidation boundary and risk. Allocate margin/equity on partial close; retain a rounding adjustment so closing in parts cannot mint cash.
- [x] Implement validated optional close quantity, bounded close history and explicit fee/proceeds. New position version uses exposure-based close fees consistently for manual and forced closure; old positions retain legacy forced fee.
- [x] Show entry/current prices, quantity, margin, equity, profit/ROI, liquidation estimate and status. Provide a dedicated partial/full close dialog with live quote; separate margin from fee and total cash on entry.
- [x] Verify bilingual/mobile browser flows, native accounting/legacy tests and short concurrent API exercise; document, push and restart preserved-data local site.

Liquidation estimate is the highest integer-sen monthly settlement price at which equity <= 15% committed margin, using the same rounding as settlement. It is a reference threshold, never a guaranteed execution price. Forced closure happens only on monthly market update. Changing margin or leverage after entry is out of scope.
