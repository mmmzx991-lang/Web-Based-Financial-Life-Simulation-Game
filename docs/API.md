# HTTP API

All JSON money values are **integer sen** (RM1 = 100 sen). Game creation and state mutations return `{id, game, summary}`. Errors return `{error}` with 400, 404, 405, 413 or 500. Requests are limited to 16 KiB.

| Method | Route | Body / response |
| --- | --- | --- |
| GET | `/api/health` | `{status:"ok"}` |
| GET | `/api/config` | Modes, difficulties, rulesets, 15 assets, planned systems |
| POST | `/api/games` | Optional `{mode:"full-life",difficulty:"normal",ruleset:"standard"}` |
| GET | `/api/games/:id` | Current in-memory game, or load last saved game after restart |
| POST | `/api/games/:id/advance` | `{months:1}` or `{months:3}` |
| POST | `/api/games/:id/trade` | `{assetId:"gold",side:"buy",quantity:1}`; side may be `sell` |
| POST | `/api/games/:id/save` | `{}`; writes current state to ignored `data/:id.json` |
| GET | `/api/games/:id/report` | Age, completion, cash, portfolio, net worth, income, expenses |

Modes: `full-life`, `early-career`, `wealth-building`, `retirement`.
Difficulties: `easy`, `normal`, `hard`, `expert`. Rulesets: `standard`, `free`.

Example (PowerShell):

```powershell
$game = Invoke-RestMethod http://127.0.0.1:3000/api/games -Method Post -ContentType application/json -Body '{"mode":"early-career"}'
Invoke-RestMethod "http://127.0.0.1:3000/api/games/$($game.id)/advance" -Method Post -ContentType application/json -Body '{"months":3}'
```

Actions are synchronous per game after request parsing and use immutable core transitions; 3-month steps settle all intermediate months. Saving is explicit. A GET returns current live progress if present, otherwise the saved snapshot. Manual rollback/import and save lists are future work. Report fields are available during play; `completed:true` makes the report final. Completed games reject further trades or advances.
