# Interaction upgrade plan — 2026-10-30

Retain the bilingual navy/teal/ivory UI and all financial rules. Improve interaction without adding game systems.

- Add a sticky session bar across game pages: current age/month, life progress, available cash and 1/3-month actions. Paused games route to the unresolved issue; ended games route to reports. Never enable advance on a paused run.
- Add dashboard shortcut cards to investment markets, portfolio, bank and report, plus useful status counts and clear hover/focus states.
- Add 25%, 50% and maximum quantity presets. Buy maximum uses integer-step binary search including leverage margin, minimum fee and cash; sell maximum uses unlocked holdings. Invalid/unaffordable orders display inline feedback and cannot submit. Close presets retain minimum-margin safeguards.
- Improve request feedback, prevent duplicate interactions during requests, announce actual settled months and return keyboard focus after dialogs. Preserve existing keyboard and mobile navigation.
- Verify native financial/preset boundaries, paused/ended controls and real browser desktop/mobile flows. Update docs, push and restart while preserving local data.

User steering: trading is too easy. Audit the v3 five-year paths, freeze old saves, and introduce v4 persistent fundamental risk, slower recovery and common tail events. Add deterministic return-distribution and serialized/action-independent replay tests; inspect 120 five-year and 100 lifetime scenarios. Surface benchmark-relative performance without changing the proposal score or salaries.
