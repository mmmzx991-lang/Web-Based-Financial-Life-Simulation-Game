# Shared implementation contract

All new game states use version 2; monetary numbers are integer sen. `ageMonths` is absolute age*12; `elapsedMonths` counts completed monthly records. End birthday is exclusive. `history` includes the initial snapshot at elapsedMonths 0, then one snapshot per completed month. `status`: active | paused | completed | bankrupt. `remainingAdvance` holds unfinished months. `prices` maps asset ID to sen per unit. Price path must depend on scenario/month only, never action or portfolio RNG consumption.

## Core exports

`server/core/config.js`: `MODES` map of mode ID to [start,end]; `DIFFICULTIES` map; `RULESETS` array; `ASSETS` array of {id,symbol,name:{en,zh},category,initialPrice,maxLeverage,...}; `PROPERTY_TYPES` and `BUSINESS_TYPES` maps with bilingual name fields and money parameters; `livingCost(age)` sen. Core may export extra constants. API /api/config exposes `{modes,difficulties,rulesets,assets,propertyTypes,businessTypes}` with these values unchanged.

`server/core/simulation.js`: `createGame(options={})`, `advance(state,months)` (months=1|3), `trade(state,order)`, `act(state,action)`, `report(state)`. All transitions immutable, throw Error on invalid input; messages may be English, UI maps messages via a bilingual error dictionary. `trade` uses action fields assetId,side buy|sell,quantity,leverage optional 1..allowed. `act` supports actions below. `advance` called only via act at API (type advance,months). Core can split implementation into other modules.

## State fields used by UI

mode,difficulty,ruleset,ageMonths,startAgeMonths,endAgeMonths,elapsedMonths,status,cash,savings,retirementBalance,monthlySalary,prices,previousPrices,holdings,positions,properties,businesses,loans,history,priceIndex,economy,news,unpaidBill,pendingEvent,remainingAdvance.

holdings: map assetId -> {quantity,lockedQuantity,averageCost}. Positions: array {id,assetId,quantity,leverage,margin,entryPrice,...}. Properties: array {id,type,value,occupied,loanId?,salePending,...}. Businesses: array {id,type,cash,value,level,...}. Loans array {id,principal,annualRate,remainingMonths,kind,...}. News array of {id,title:{en,zh},body:{en,zh},...}. Pending event contains bilingual title/body and id. Unpaid bill contains id and amount; any extra fields documented by implementer. History snapshot: elapsedMonths,ageMonths,cash,assets,liabilities,netWorth,realNetWorth,priceIndex,income,expenses,benchmark; extra ledger details welcome.

Report minimum: age,month,retired,completed,bankrupt,cash,portfolioValue,propertyValue,businessValue,assets,liabilities,netWorth,realNetWorth,totalIncome,totalExpenses,monthsPlayed,priceIndex,benchmark,realBenchmark,drawdown,forcedLiquidations,unpaidMonths,latePayments,defaults,milestone,score:{wealth,risk,cashFlow,debt,total},history (or use game.history). Completed means completed endpoint only, bankrupt separate. `monthlySalary` state becomes 0 at60.

## Actions

advance {months:1|3}; resume {}; acknowledge-event {}; trade {assetId,side,quantity,leverage?}; close-position {positionId}; savings-deposit {amount}; savings-withdraw {amount}; retirement-deposit {amount}; retirement-withdraw {amount}; take-loan {amount,term}; repay-loan {loanId}; buy-property {propertyType,financing:boolean}; sell-property {propertyId}; start-business {businessType}; business-dividend {businessId,amount}; business-advertise {businessId}; business-upgrade {businessId}; sell-business {businessId}; pay-bill {}; extend-bill {}; declare-bankruptcy {}. All IDs opaque strings. No irreversible real-world actions.

## HTTP

GET /api/config (public). GET /api/auth/me -> {user:null|{id,displayName,email?,guest}}. POST /api/auth/register {displayName,email,password}, /login {email,password}, /guest {}, /logout {} -> {user} (logout null). Cookie sessions HttpOnly SameSite=Lax; protect mutations with same-origin checks. GET /api/games -> {games:[{id,mode,difficulty,ruleset,status,ageMonths,updatedAt,...}]}. POST /api/games {mode,difficulty,ruleset} -> {id,game,summary}. GET /api/games/:id same. POST /api/games/:id/action {requestId:UUID,action:{type,...}} -> same; duplicate requestId must return original response without repeating state changes. GET /api/games/:id/report -> report. POST /api/games/:id/save optional compatibility (autosave mandatory). GET /api/leaderboard?mode=...&difficulty=... -> {entries:[{displayName,score,realNetWorth,monthsPlayed,...}]}. One best fully completed Standard result per user per category. API owner checks on every game route, including report. Sessions and game action dedupe survive restart. JSON errors {error,code?}. Existing anonymous v1 data is not imported; show clear migration note.

Frontend modules: app.js orchestrates authenticated fetch, language/view state, actions and DOM events; i18n.js exports t(key), setLanguage(lang), getLanguage(), bilingual helpers; views.js produces HTML using escaped dynamic values; charts.js accessible SVG charts. Static server must serve /i18n.js,/views.js,/charts.js,/game-world.svg (or safely serve files under public).
