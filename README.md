# Investment Game 投资人生

A bilingual financial life simulation. Make monthly decisions about income, spending, investments, property and debt, then review how your choices affect your finances. Switch **English / 中文** at any time.

中英双语财务人生模拟游戏。每月管理收入、支出、投资、房产和债务，并在报告中查看这些决定的长期影响。可随时切换语言。

## Run 运行

Install **Node.js 24 LTS**, then:

```sh
git clone https://github.com/mmmzx991-lang/Web-Based-Financial-Life-Simulation-Game.git
cd Web-Based-Financial-Life-Simulation-Game
npm start
```

Open **http://127.0.0.1:3000**. Runtime has no third-party dependencies; `npm install` is needed only for optional browser tests. `npm run dev` enables server restart on changes. Set `PORT` to choose another port. The default host is local-only `127.0.0.1`.

安装 Node.js 24 LTS 后运行以上命令，打开本地地址。可注册本地账户，也可游客试玩；游客注册后保留原有进度。游戏在每次成功操作及月度结算后自动保存。账户与存档保存在本机此项目的 `data/` 中，不会上传 GitHub。

## Life stages / 人生阶段

All four browser game modes count from the start of the run. Use Bank for fixed deposits and Market for emergency planning and insurance during the first 36 months, trade stocks without leverage for the next 60 months, and access the full market, property and businesses after month 96.

四种模式均从各自开局计时。第 36、96 个月弹出阶段分数并颁发奖章。「继续游戏」会推进本次剩余月份。「保存并退出」会保留结算点，重新进入后可推进剩余月份。第三阶段也可随时保存退出。

前三年，银行办理定存。Market 的理财与保障页面显示三个月生活费的储备目标，并提供可选的应急保险。游戏内突发开支按月结算，保费为每月 RM 90，扣除 RM 200 免赔额后赔付 80%，每次最多 RM 2,000。保障在第 36 个月结算后结束。储蓄基准承担同样的突发开支，账单和报表列出保费、开支与理赔。

个人主页汇总阶段奖章和盈利奖章。盈利奖章按扣除手续费后的已实现净利润计算，门槛为累计交易净赚 RM 1,000,000 或比特币净赚 RM 100,000。旧章节存档保留已获得的分数和奖章，并在尚未到达的新阶段节点结算。

## Architecture 项目架构

The browser runs plain JavaScript modules. One Node.js process serves the UI, handles the JSON API, and writes local saves. The server calculates the game state used by reports and the leaderboard.

浏览器运行原生 JavaScript 模块。一个 Node.js 进程提供页面和 JSON API，并写入本地存档。报告与排行榜使用服务端计算的游戏状态。

| Area 模块 | Entry points 入口 | Responsibility 职责 |
| --- | --- | --- |
| Browser UI 网页界面 | [`public/index.html`](public/index.html), [`app.js`](public/app.js), [`views.js`](public/views.js) | Load the page, handle player actions, and render returned state. 加载页面、处理玩家操作并渲染返回状态。 |
| Interface and exports 界面与导出 | [`i18n.js`](public/i18n.js), [`charts.js`](public/charts.js), [`export-report.js`](public/export-report.js) | Translate labels, draw charts, and convert game records and report totals to CSV. 负责双语文案、图表和 CSV 导出。 |
| HTTP API and accounts 接口与账户 | [`server/index.js`](server/index.js), [`app.js`](server/app.js), [`auth.js`](server/auth.js) | Start the server, serve assets, and check session and save ownership before accepting game actions. 启动服务、提供静态资源，处理操作前验证会话和存档归属。 |
| Game routes 游戏路由 | [`game-routes.js`](server/game-routes.js) | Create and load owned games, apply actions, and return reports or replayed responses. 创建和读取当前账户的游戏、处理操作并返回报告或已记录的响应。 |
| HTTP helpers HTTP 辅助模块 | [`request-body.js`](server/request-body.js), [`static-files.js`](server/static-files.js) | Read bounded JSON request bodies and serve browser files from the public directory. 读取有大小限制的 JSON 请求，并从公开目录提供浏览器资源。 |
| Simulation 模拟引擎 | [`simulation.js`](server/core/simulation.js), [`monthly.js`](server/core/monthly.js), [`market.js`](server/core/market.js) | Dispatch actions, advance monthly settlement, and update simulated prices and news. 分派操作、推进月度结算，更新模拟行情和新闻。 |
| Game settings and reports 参数与报告 | [`config.js`](server/core/config.js), [`finance.js`](server/core/finance.js) | Set modes, difficulty presets, and asset parameters. Calculate balances, month-end snapshots, and report summaries. 配置模式、难度和资产，计算余额、月末快照及报告汇总。 |
| Shared calculations 共用计算 | [`order-math.js`](public/order-math.js), [`leverage-math.js`](public/leverage-math.js) | Share order fee and leverage calculations between browser previews and server execution. 在前端预览与服务端执行时复用手续费和杠杆计算。 |
| Persistence 存档 | [`server/store.js`](server/store.js) | Save accounts, sessions, game state, and request records in local `data/v2-state.json` using atomic file replacement. 通过原子替换写入本地 JSON，保存账户、会话、游戏状态和请求记录。 |

### Game action flow 游戏操作流程

1. The browser sends an action and its request ID to `POST /api/games/:id/action`. 浏览器提交操作和请求 ID。
2. The API checks session and game ownership, then dispatches the action to the simulation. A repeated request ID returns a recorded result without applying the action again. API 验证会话和存档归属，再交给模拟引擎处理。重复请求会返回已记录的结果，避免重复结算。
3. After a successful action, the API saves the new game state and request record, then returns the state and report summary for the browser to render. 操作成功后，API 保存状态和请求记录，再返回更新后的状态与报告汇总。

Regression tests are in [`tests/`](tests/). Browser and load checks are in [`scripts/`](scripts/). See the [API reference](docs/API.md), [game rules](docs/CORE-NOTES.md), and [account and save notes](docs/BACKEND-NOTES.md) for details.

回归测试见 [`tests/`](tests/)，浏览器和并发验证脚本见 [`scripts/`](scripts/)。

## Playable features 已实现功能

- **Four life modes**: Full Life 22–80 / 696 months; Early Career 22–45 / 276; Wealth Building 45–60 / 180; Retirement 60–80 / 240.
- **Four difficulty presets**: Easy / Normal / Hard / Expert starting cash, salary, properties and Expert retirement mortgage. No opening financial holdings. Full Life gets no free asset reset at 45 or 60.
- **Monthly settlement**: advance 1 or 3 months through the same procedure, pause for required events or unpaid bills, resume only remaining months. Salary increases 2.5% on working birthdays and stops at 60. Fixed basic living costs: RM2,000 / RM3,000 / RM2,500 at ages 45 and 60.
- **15 assets**: six fictional stocks, gold, Bitcoin, Ethereum, crude oil, natural gas, silver, copper, wheat and corn. Crypto orders start at 0.01 coin in steps of 0.01; other assets use whole units; one monthly price; one fee per trade; current-month holdings are locked. Long-only leverage capped at 2×, or 3× for crypto, with equity-only accounting and monthly forced liquidation. Entry previews separate margin/fees/total cash and show an estimated liquidation price. Positions show current P&L, ROI and risk; close any valid quantity with a proceeds preview and recent closure history.
- **Economy and news**: variable-duration expansion, boom, recession and recovery; persistent inflation/rates/credit/demand, correlated asset shocks, volatility clustering, fundamental valuations and multi-month news impulses. Standard public prices/news depend only on mode, difficulty and scenario month. Free uses a separate scenario and keeps its scores private.
- **Property**: three types, purchase/mortgage, maintenance, occupied rent, vacancy/search timing, and sales at the next settlement after fee and mortgage repayment.
- **Business**: three venture types, monthly revenue/cost/profit, retained cash, distributions, advertisements, upgrades and next-settlement sales.
- **Banking and difficulties**: deposits, retirement saving/withdrawal, fixed amortizing loans, unpaid liabilities, one fee-bearing bill extension and bankruptcy reports. Transfers, loan principal and business distributions never become fictitious new income.
- **Accounts and saves**: password hashing, independent accounts, guest upgrade, durable sessions, automatic saves, persisted request identifiers, owner checks and retry-safe state changes.
- **Reports and leaderboard**: current balance sheet with spendable cash, nominal wealth chart and an inflation-adjusted comparison, and weighted score. The webpage lists the latest 24 settled months. The localized CSV includes current balances and the full history; one best completed Standard result per player/mode/difficulty.
- **Responsive bilingual UI**: sticky month/cash/progress controls, dashboard shortcuts, exact-step trade size presets, inline order validation and dialog focus restoration; categorized stock/crypto/gold/commodity markets, energy/metals/agriculture filters, search/sort, instrument price histories and order details; homepage, setup, life board, market, portfolio, news, property, business, bank, reports, leaderboard, profile and help; keyboard focus and mobile navigation.

已完成四种人生模式与四难度初始场景、月度推进、15 种资产与锁仓及杠杆、四种经济状态和 60 条双语新闻、房产出租出售、企业经营、银行与贷款、欠账延期及破产、账户与自动存档、财富图表、评分、排行榜及中英文 CSV 报告。

V4 adds persistent issuer/adoption uncertainty, weaker valuation pull and liquidity tail events; benchmark-relative results distinguish decisions from salary accumulation. New games use market model v4; existing v2/v3 saves retain their original rules and are excluded from the current leaderboard. See [market model](docs/MARKET-MODEL.md).

加密货币支持 0.01 个起步及递增。市场按股票、加密货币、黄金和商品分类，商品再细分能源、金属及农产品。新开人生采用升级算法；旧存档继续原规则，排行榜只接受当前算法的新游戏。

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

Game settings are centralized in `server/core/config.js` and documented in [core notes](docs/CORE-NOTES.md): trade fee 0.25% of the traded value with a minimum of RM1.00; forced liquidation adds no fee; property/business sale fees 2%/3%; savings/retirement rates 3%/4%; personal loans 7.5% (12/24/36/60 months, maximum RM200,000 outstanding); new mortgages 20% down / 4.5% / 240 months; extension fee RM50. Asset returns, inflation, tenant chance and business prices/results are simulated balancing settings. Stock names are fictional.

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
