# Web-Based Financial Life Simulation Game

Investment Game is a simple English financial life simulation scaffold for CAT404. This is an initial runnable framework, **not the complete V12.6 game**.

## Run locally

Install [Node.js 24 LTS](https://nodejs.org/), then from the repository root:

```sh
npm start
```

Open **http://127.0.0.1:3000**. There are no third-party dependencies and no install or build step. For auto-restart during development use `npm run dev`. Run `npm test` and `npm run check` before committing. `PORT` changes the port; `HOST` defaults to `127.0.0.1`.

## Structure

```text
public/                 English responsive page, styles and browser API client
server/index.js         Local server entry point
server/app.js           HTTP routes, JSON validation and static files
server/store.js         Independent game states and explicit JSON saves
server/core/config.js   Life windows, expenses and provisional asset catalog
server/core/market.js   Seeded monthly illustrative market updates
server/core/simulation.js  Creation, settlement, trading and reports
server/systems/         Property, business and news extension descriptors
tests/                  Core boundary tests and real HTTP integration test
docs/                   Scope, API contract and implementation plan
.github/workflows/      Syntax checks and tests on push / pull request
data/                   Local saved games (generated, ignored by Git)
```

## Available now

- Four life modes: Full Life 22–80, Early Career 22–45, Wealth Building 45–60, Retirement 60–80.
- Four difficulty choices: Easy, Normal, Hard, Expert. Current effect is market volatility only.
- Standard / Free selectors. Free customisation is not implemented yet; both use the same base rules.
- Advance 1 or 3 months; every month settles separately and stops at the exact mode endpoint.
- Fixed retirement at 60, annual salary increase of 2.5%, monthly expenses of RM2,000 at ages 22–44, RM3,000 at 45–59 and RM2,500 from 60.
- Fifteen provisional financial asset types, seeded illustrative price updates and simple buy/sell orders.
- Separate game IDs, manual server saves, resume from the same browser, progress/final report and JSON report download.
- Responsive dashboard, basic API validation, tests and CI configuration.

## Scope and assumptions

The supplied V12.6 CAT404 summary is the source for the fixed age and cashflow rules. The complete frozen proposal was not available for comparison. Starting cash (RM50,000), salary (RM5,000/month), asset names, prices, returns, four difficulty names and volatility factors are **scaffold assumptions**, not verified proposal facts. Salary growth occurs after each 12 elapsed simulation months; later life modes start with the same illustrative salary, except Retirement which starts with zero salary. End age is exclusive: the last settlement covers the month immediately before that birthday.

Property, businesses and news are visible planned extension boundaries only. Detailed Free rules, taxes, inflation, pensions, interest on cash, transaction fees, borrowing, bankruptcy, asset restrictions and rich final scoring are not implemented. Asset yields are represented as price growth; there are no separate dividends or coupons. Negative cash is displayed rather than applying an invented bankruptcy rule. These choices keep this initial framework small and explicit.

The target is around 20 independent players. Tests create 20 isolated sessions, but no production concurrency or capacity claim is made. Saves use files for one server process. Unsaved changes are lost on restart; the browser remembers only the most recently saved game ID. No account authentication is implemented: a random game ID acts as an access capability, so anyone who obtains it can access or change that game. Do not expose this scaffold as a public production service before adding authentication, rate limits, session lifecycle management, durable shared storage and deployment security. Local saves remain outside Git.

See [API](docs/API.md), [proposal mapping](docs/PROPOSAL-MAPPING.md) and [plan](docs/PLAN.md).
