# API v2

All money is integer sen (RM1 = 100 sen). Crypto quantities are positive multiples of 0.01 coin; all other assets require positive integer units. Configuration exposes quantityStep, sector, unit and risk. New games use marketVersion:3; save/API version remains 2. Names and prepared events are `{en,zh}` objects. Dynamic interface copy is localized by the browser. Authentication uses an opaque HttpOnly, SameSite=Lax cookie. The default server is local-only.

| Method | Path | Body / result |
| --- | --- | --- |
| GET | `/api/health` | `{status:"ok",version:2}` |
| GET | `/api/config` | modes, difficulties, rulesets, assets, propertyTypes, businessTypes, settings, tradeFeeRate |
| GET | `/api/auth/me` | `{user:null}` or public account information |
| POST | `/api/auth/register` | `{displayName,email,password}`; creates account or upgrades current guest |
| POST | `/api/auth/login` | `{email,password}` |
| POST | `/api/auth/guest` | `{}`; creates a distinct guest identity |
| POST | `/api/auth/logout` | `{}`; revokes session |
| GET | `/api/games` | `{games:[...]}` owned by current account |
| POST | `/api/games` | `{mode,difficulty,ruleset}` → `{id,game,summary}` |
| GET | `/api/games/:id` | owned saved state → `{id,game,summary}` |
| POST | `/api/games/:id/action` | `{requestId:UUID,action:{type,...}}` → `{id,game,summary}` |
| POST | `/api/games/:id/save` | `{}`; compatibility acknowledgment, all successful actions already save |
| GET | `/api/games/:id/report` | owned report with score and saved history |
| GET | `/api/leaderboard?mode=...&difficulty=...` | public completed market-v3 Standard category; entries contain a score object with total |

Valid modes: `full-life`, `early-career`, `wealth-building`, `retirement`. Difficulties: `easy`, `normal`, `hard`, `expert`. Types: `standard`, `free`.

## Actions

| type | Other fields |
| --- | --- |
| `advance` | `months:1` or `3` |
| `resume`, `acknowledge-event`, `pay-bill`, `extend-bill`, `declare-bankruptcy` | none |
| `trade` | assetId, side buy/sell, quantity, optional leverage 1/2/3 within category cap |
| `close-position` | positionId, optional quantity (omitted closes all); whole units except crypto 0.01 steps |
| `savings-deposit`, `savings-withdraw`, `retirement-deposit`, `retirement-withdraw` | amount in sen |
| `take-loan` | amount, term 12/24/36/60 |
| `repay-loan` | loanId |
| `buy-property` | propertyType apartment/condominium/shoplot, financing boolean |
| `sell-property` | propertyId |
| `start-business` | businessType coffee-shop/online-store/tech-startup |
| `business-dividend` | businessId, amount |
| `business-advertise`, `business-upgrade`, `sell-business` | businessId |

State transitions and request-response replay are persisted together. Repeating the same request ID and action returns its original response, including the original append-only history prefix, without settling again. A new action needs a new request ID. The frontend retains a pending action's ID after a network failure so retries reuse it. Reusing an ID for another action is rejected. Ownership checks apply to every private game route.

`status` is active, paused, completed or bankrupt. `history[0]` is the opening snapshot; subsequent records are completed months. `marketMonth` can be one ahead of elapsedMonths while a bill blocks completion. `remainingAdvance` and pending decisions are saved. `unpaidBill.amount` is the remaining liability after available cash was applied. After an extension, resume the following due month; manual bankruptcy is offered only for an actually pending settlement, ensuring final costs enter history. See CORE-NOTES for the exact sequence.

Errors are `{error,code?}`. Typical status: 400 invalid action, 401 login required, 404 absent/other-owner game, 409 conflicting replay or duplicate account, 413 oversized body, 429 auth throttling. Bodies are limited to 16 KiB. Cross-origin mutations are rejected. API errors remain English internally; the interface translates common errors for Chinese users.

Position state additionally exposes `positionVersion` and optional `roundingAdjustment`. `positionHistory` retains the most recent 200 manual/forced closures: month, quantity, allocated margin/equity, entry/exit prices, P&L before exit fee, exit fee and net cash proceeds. Partial close keeps the same position ID, entry price and unlock month. Tiny partial closes leaving zero margin are rejected.
