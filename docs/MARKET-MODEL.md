# Current market model v4

New games use marketVersion 4 and Standard scenario label standard-v4. Existing v3 and unversioned/v2 saves retain their original dynamics; current leaderboard accepts v4 only. Salary, fixed life budgets, asset counts, monthly pricing, fees and the 15% leveraged liquidation rule stay unchanged.

## Why v4

A five-year price-only inspection over 120 fixed Free seeds found Meridian Technology profitable in 115/120 v3 scenarios. Its fundamental grew almost deterministically (only a 0.3% monthly earnings shock) and prices reverted strongly to that anchor. This created unusually reliable long-horizon recovery and a favorable buy-below-anchor signal.

V4 replaces that near-fixed anchor with persistent issuer earnings/adoption cycles (AR 0.92), category-scaled stochastic fundamentals, common earnings shocks, and permanent impairment from shared liquidity sell-offs. Valuation reversion is slower: 1.2% monthly for stocks/gold, 0.3% for crypto and 2.5% for commodities. There is no guaranteed return to an old price.

Liquidity sell-off probability is 0.8% + 2% times macro credit stress per month; rallies occur on the upper 1.2% of the same independent draw. Stock log shocks range from -7% to -23% for sell-offs, +4% to +13% for rallies. Crypto sensitivity is 2.2, commodities 0.8 and gold -0.2. A sell-off impairs non-gold fundamentals by 35% of its log impact. All addresses depend only on scenario/month/instrument, never player choices. These are fictional balance parameters, not real-market calibration.

Reproduce the comparison with node scripts/market-balance-check.mjs: v4 Meridian wins 88/120, with 32 losses and 62 scenarios exceeding 30% drawdown. BTC wins 33/120 (median price return -46.1%, 90th percentile +105.0%). BTC valuation-below-0.8 signals win next month in 48.8% of 3,354 observations (v3:56.1%). Results exclude dividends, fees, salaries and optimized strategies; they are sample regressions, not acceptance of final game balance.

A 100-seed x 696-month numerical run returned only positive safe-integer prices (range 1–1,160,877,884 sen). There were 296 observations at the one-sen currency floor; unlike v3, severe speculative losses can reach that representational boundary. Further balancing/user playtesting remains necessary.

## Preserved v3 model

# Fictional monthly market, version 3

These are developer balancing notes. They describe a fictional simulation, not real security prices or forecasts. No external feeds are used.

## Version and replay contract

Only `game.marketVersion === 3` selects this model. Missing versions and explicit version 2 use the unchanged legacy 18-month economy phases, news rotation, uniform asset shocks, rental rules and business equations. Existing save files are not migrated. Version 3 standard seeds use the `standard-v3` scenario label and belong to a separate leaderboard category.

Every public market random draw is addressed by scenario seed, month and named stream. FNV text hashing is followed by two avalanche mixing rounds; independent uniform pairs feed the Box–Muller normal transform. Markets never consume a mutable random counter. Trades, asset ownership, vacancies, business choices and generated object IDs cannot change prices, macro factors or public news. Private rental/business outcomes have their own named streams. A saved partially settled month already contains its market update and cannot apply that update again when its invoice is paid or its career event acknowledged.

## Persistent economic state

`game.economy` is expansion, boom, recession or recovery. `game.marketState.regimeMonths` and `regimeDuration` retain progress between updates. Initial expansion lasts 10–34 months. Subsequent recessions last 7–33 months and other phases 10–36 months. A weighted transition chooses a different phase: recessions favor recovery; recovery favors expansion; boom is more likely to end in recession. Durations and transitions depend on the seeded scenario.

The economy label changes the destinations of gradually adjusting macro factors. It does not instantly reset them. `game.macro` fields are:

| Field | Meaning / units |
| --- | --- |
| `growth` | Annual GDP growth rate, decimal; bounded −5.5% to 8.5% |
| `inflation` | Annual inflation rate, decimal; bounded −0.8% to 9% |
| `policyRate` | Annual policy rate, decimal; bounded 0.25% to 12% |
| `confidence` | Consumer/business confidence, 0–1 |
| `creditStress` | Credit tightness, 0–1; higher is worse |
| `liquidity` | Market funding availability, 0–1 |
| `propertyReturn` | This month's nominal property value change, decimal |
| `rentDemand` | Rental demand multiplier; 0.7–1.2 |
| `businessDemand` | Business demand multiplier; 0.65–1.3 |
| `inputCostGrowth` | This month's change in business input costs |

GDP growth and confidence share demand shocks. Inflation has persistent supply shocks and responds to growth. Policy adjusts toward an inflation/growth reaction rule. Rates influence growth and credit; liquidity and credit retain their own persistence. Monthly price-index inflation is `expm1(annualInflation / 12)`. Salary schedules, fixed age-stage living budgets, opening assets, interest contracts and settlement order retain their proposal rules.

## Asset prices, fundamentals and correlation

Monthly returns combine a common market normal, a category normal and an individual asset normal. Stocks and crypto load more strongly on the common market; gold has a negative common loading; commodities have a smaller positive loading. Individual noise prevents identical paths. Separate exponentially weighted variances retain shocks with 90–92% monthly persistence, producing volatility clusters. Variances are bounded 0.4–3.5, a balancing restriction on volatility rather than a price ceiling.

Fundamental estimates compound at configured annual total return minus dividend yield, with macro sensitivities and small earnings shocks. Stock sectors have distinct sensitivities to growth, policy rates and credit: technology is rate-sensitive, banking credit-sensitive and healthcare more defensive. Gold responds to inflation and real funding conditions; crypto to liquidity and rates; agricultural commodities are less growth-sensitive than energy and industrial metals.

Log returns add fundamental drift, macro response, correlated shocks, mean reversion toward fundamental value and news impulses. Mean reversion is 5.5% of the log valuation gap per month for stocks/gold, 9% for commodities and 4.5% for crypto. This controls long-run valuation drift without an arbitrary upper price clamp. Prices round to integer sen with a one-sen representational floor. Annual configuration returns are educational balancing anchors, not guaranteed realized returns. Dividends are rounded to sen from units × fundamental estimate × annual yield / 12, so a temporary speculative premium does not create equal dividend growth.

`game.assetMetrics[id]` contains `fundamental` (continuous model estimate in sen), `valuation` (price / fundamental), `volatility` (estimated annual decimal), `trend` (smoothed monthly return), `variance` (individual variance multiplier) and `earningsIndex` (fundamental / opening fundamental). Estimates are not spendable money; every cash flow, tradable price and holding valuation rounds at the accounting boundary.

`game.priceHistory[id]` contains `{month, price}` observations, including the initial month-zero price for newly initialized games. It retains at most 241 observations, enough for 20 years plus a starting point. This bounded series is separate from the append-only financial closing `game.history`.

## News persistence

Each month selects one authored bilingual template from templates not used in the prior 12 months. Selection is seeded rather than sequential. Displayed `game.news[0]` records its unique monthly ID, `templateId`, month and age. `marketState.recentNews` holds 12 template IDs. `marketState.activeNews` retains at most three dated impulses, with each entry recording its effects, start month and last applied month.

A template's effect is distributed 60% in its publication month, 28% next month and 12% in the third month. These weights sum to one: persistence does not repeatedly apply the original full shock. Instrument-specific effects take priority over category effects, then universal effects. Old impulses expire after their third contribution. Public news does not independently alter salary, billed expenses or the policy rule a second time.

## Property and business transmission

Property appreciation responds to growth, policy rates and credit stress plus a modest common property shock. Player and benchmark properties receive the same monthly `propertyReturn`. Rental demand changes vacancy risk (baseline 0.7% monthly, rising in weak markets) and tenant matching (baseline 65% times demand, bounded 20–90%). A match starts paying the next month. Rent is contracted at matching and reviewed annually, with a partial inflation/demand link; maintenance has a half-strength inflation link. `vacancyProbability` and `tenantSearchProbability` are internal fixture overrides, never public action controls. Opening occupied/vacant rules are unchanged.

Businesses retain separate revenue and operating-cost shocks. Demand sensitivity differs across coffee shops, online stores and technology startups; startups also suffer more under tight credit. New businesses inherit prevailing input prices, including inflation before setup; input costs then compound with monthly macro inflation/supply conditions. Revenue prices have an 85% inflation pass-through; input exposure differs by business type. Monthly revenue/cost outcomes round to sen and retain the existing cash, owner-deficit, bill and business-value accounting.

Upgrade revenue multiplier is `1 + 0.22 × log2(activeLevel)`; the cost multiplier is `1 + 0.12 × (activeLevel − 1)^0.8`. Higher levels continue to help with smaller marginal gains. Advertising initially increases revenue by up to 16%; repeated campaigns accumulate an audience-saturation state that decays 13% per month, while higher upgrade levels also reduce incremental advertising lift. Existing next-month upgrade timing and three-month advertising contracts remain unchanged.

## Balancing and verification

Tune regime destinations/transitions, response coefficients, variance persistence, news weights, valuation reversion and property/business pass-throughs in `market.js` and `monthly.js`. Asset return/yield/volatility anchors and unit/risk/sector metadata live in `config.js`. Changes to these parameters require a new market version before mixing results into a competitive leaderboard.

`tests/market-dynamics.test.js` covers variable phase duration, macro transmission to prices/property/rent/business, seeded replay after serialization, public-path independence from ownership, monthly/quarter equivalence, bounded history, news non-repetition/expiry, normal distribution statistics, category correlation, independent return directions, volatility clustering, diminishing business gains, fundamental dividends and frozen legacy outcomes. Existing core tests also cover all easy-mode endpoints and exact pending settlement recovery. A 100-seed, 696-month inspection found no prices at the one-sen floor or the old one-billion-sen clamp; observed prices ranged from 1,599 to 348,930,478 sen. This is a regression check, not a universal bound or a forecast.
