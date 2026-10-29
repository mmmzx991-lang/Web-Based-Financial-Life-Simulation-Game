# Investment Game 投资人生

A playable bilingual financial life simulation for CAT404, implemented from the supplied project proposal. Switch **English / 中文** at any time. This is an educational local MVP, with configurable game balance parameters and an original vector interpretation of the reference UI.

基于项目 proposal 的中英双语财务人生模拟游戏。可随时切换语言，桌面和手机使用同一套规则。本版本是可运行的本地 MVP，尚未完成真实用户验收或公网部署。

## Run 运行

Install **Node.js 24 LTS**, then:

```sh
git clone https://github.com/mmmzx991-lang/Web-Based-Financial-Life-Simulation-Game.git
cd Web-Based-Financial-Life-Simulation-Game
npm start
```

Open **http://127.0.0.1:3000**. Runtime has no third-party dependencies; `npm install` is needed only for optional browser tests. `npm run dev` enables server restart on changes. Set `PORT` to choose another port. The default host is local-only `127.0.0.1`.

安装 Node.js 24 LTS 后运行以上命令，打开本地地址。可注册本地账户，也可游客试玩；游客注册后保留原有进度。游戏在每次成功操作及月度结算后自动保存。账户与存档保存在本机此项目的 `data/` 中，不会上传 GitHub。

## Playable features 已实现功能

- **Four life modes**: Full Life 22–80 / 696 months; Early Career 22–45 / 276; Wealth Building 45–60 / 180; Retirement 60–80 / 240.
- **Four exact proposal openings**: Easy / Normal / Hard / Expert starting cash, salary, properties and Expert retirement mortgage. No opening financial holdings. Full Life gets no free asset reset at 45 or 60.
- **Monthly settlement**: advance 1 or 3 months through the same procedure, pause for required events or unpaid bills, resume only remaining months. Salary increases 2.5% on working birthdays and stops at 60. Fixed basic living costs: RM2,000 / RM3,000 / RM2,500 at ages 45 and 60.
- **15 assets**: six fictional stocks, gold, Bitcoin, Ethereum, crude oil, natural gas, silver, copper, wheat and corn. Integer-unit orders; one monthly price; one fee per trade; current-month holdings are locked. Long-only leverage capped at 2×, or 3× for crypto, with equity-only accounting and monthly forced liquidation.
- **Economy and news**: expansion, boom, recession and recovery; 60 prepared English/Chinese news templates. Standard public prices/news depend only on mode, difficulty and scenario month. Free uses a separate scenario and keeps its scores private.
- **Property**: three types, purchase/mortgage, maintenance, occupied rent, vacancy/search timing, and sales at the next settlement after fee and mortgage repayment.
- **Business**: three venture types, monthly revenue/cost/profit, retained cash, distributions, advertisements, upgrades and next-settlement sales.
- **Banking and difficulties**: deposits, retirement saving/withdrawal, fixed amortizing loans, unpaid liabilities, one fee-bearing bill extension and bankruptcy reports. Transfers, loan principal and business distributions never become fictitious new income.
- **Accounts and saves**: password hashing, independent accounts, guest upgrade, durable sessions, automatic saves, persisted request identifiers, owner checks and retry-safe state changes.
- **Reports and leaderboard**: opening snapshot plus monthly history, nominal/real wealth chart, conservative benchmark, weighted score, localized CSV downloads; one best completed Standard result per player/mode/difficulty.
- **Responsive bilingual UI**: homepage, setup, life board, market, portfolio, news, property, business, bank, reports, leaderboard, profile and help; keyboard focus and mobile navigation.

已完成四种人生模式与四难度初始场景、月度推进、15 种资产与锁仓及杠杆、四种经济状态和 60 条双语新闻、房产出租出售、企业经营、银行与贷款、欠账延期及破产、账户与自动存档、财富图表、评分、排行榜及中英文 CSV 报告。

## Opening finances 初始财务

All values below are **RM**. Property abbreviations: A = Apartment 公寓 (250,000), C = Condominium 高级公寓 (500,000), S = Shoplot 店屋 (800,000). Opening properties are occupied.

| Difficulty 难度 | Cash 22 | Salary 22/month | Cash 45 | Property 45 | Cash 60 | Property 60 |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| Easy 简单 | 100,000 | 5,000 | 220,000 | C + A | 400,000 | 2C + S |
| Normal 普通 | 60,000 | 4,500 | 140,000 | A | 280,000 | C + A |
| Hard 困难 | 35,000 | 3,800 | 70,000 | — | 170,000 | A |
| Expert 专家 | 20,000 | 3,200 | 40,000 | — | 90,000 | A + 120,000 mortgage |

Age-45 salary compounds the age-22 salary for 23 years. Retirement salary is zero. Only Expert's opening retirement property has a mortgage: 4.5% / 240 months. Other opening properties have no loans.

## Explicit assumptions 教学参数与限制

Parameters missing from the proposal are centralized in `server/core/config.js` and documented in [core notes](docs/CORE-NOTES.md): trade fee 0.2%; property/business sale fees 2%/3%; savings/retirement rates 3%/4%; personal loans 7.5% (12/24/36/60 months, maximum RM200,000 outstanding); new mortgages 20% down / 4.5% / 240 months; extension fee RM50. Asset returns, inflation, tenant chance and business prices/results are simulated balancing settings. Stock names are fictional choices; the proposal fixes categories/counts, not those names.

The benchmark automatically earns savings interest on positive cash and keeps its opening properties occupied. Free changes the private scenario; it is not a rules editor. There is no real market feed, real-money trading, external news or AI news generation. Leverage is monthly, not intraday. No weekly turns, messaging or player trading are included.

使用本地文件仓库，面向单个 Node.js 进程和约 20 人的课程演示；不支持多个服务进程同时写入同一存档文件。已做短时并发与浏览器测试，尚未做长时间压力测试、真实用户研究或正式生产安全审计。公开仓库并不等于网站已部署到公网。公网部署前仍需 HTTPS、备份、运维与安全审查。账户不含邮箱验证、找回密码功能；游客会话丢失后无法按邮箱登录，建议及时注册。旧 v1 匿名存档不自动迁移到 v2。

## Verification 验证

```sh
npm run check
npm test
npm run test:load
```

For real-browser checks (development dependency):

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

On Windows, the browser check uses installed Microsoft Edge when available; otherwise it uses Playwright Chromium. Set `BROWSER_EXECUTABLE` for another compatible executable. Screenshots go to ignored `.browser-results/`.

Tests cover age boundaries, exact openings, accounting, locks, leverage, rents, sales, loan amortization, bill recovery, duplicate requests, account isolation, restart, score formulas and all four Easy mode endpoints. The browser check uses temporary accounts, switches English/Chinese, checks mobile overflow, trades, saves, upgrades a guest and completes a real 276-month run into the leaderboard. `test:load` runs 20 independent accounts for 12 months each (140 HTTP requests) and reports measured local latency. These checks are also configured in GitHub Actions.

## Structure 目录

```text
public/           bilingual responsive UI, original SVG world, charts and CSV export
server/core/      configuration, prepared news, market, finance, monthly procedure, actions
server/auth.js    password hashing, sessions, same-origin checks and auth throttles
server/store.js   atomic file repository for accounts, games, sessions and request replay
server/app.js     authenticated HTTP API and safe static serving
tests/            core, account, API and bilingual view regression checks
scripts/          syntax, real-browser and 20-player concurrency checks
docs/             API, proposal mapping, implementation decisions and limitations
data/             generated local private data, ignored by Git
```

See [API](docs/API.md), [proposal mapping](docs/PROPOSAL-MAPPING.md), [core notes](docs/CORE-NOTES.md) and [backend notes](docs/BACKEND-NOTES.md).
