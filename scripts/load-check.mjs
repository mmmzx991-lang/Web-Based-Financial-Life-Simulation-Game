import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createApp } from "../server/app.js";
const directory = mkdtempSync(join(process.cwd(), ".test-data-load-"));
const server = createApp({ dataDir: directory });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`,
  latencies = [],
  started = performance.now();
async function call(path, cookie, body) {
  const start = performance.now();
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  latencies.push(performance.now() - start);
  assert.ok(response.ok, JSON.stringify(value));
  return {
    value,
    cookie: response.headers.get("set-cookie")?.split(";")[0] || cookie,
  };
}
try {
  const players = await Promise.all(
    Array.from({ length: 20 }, async (_, i) => {
      const { cookie } = await call("/api/auth/register", null, {
        email: `load${i}@example.test`,
        displayName: `Load ${i}`,
        password: "Load-Check-2026",
      });
      const { value } = await call("/api/games", cookie, {
        mode: "early-career",
        difficulty: "normal",
        ruleset: "standard",
      });
      return { cookie, run: value };
    }),
  );
  for (let round = 0; round < 4; round++)
    await Promise.all(
      players.map(async (player) => {
        player.run = (
          await call(`/api/games/${player.run.id}/action`, player.cookie, {
            requestId: randomUUID(),
            action: { type: "advance", months: 3 },
          })
        ).value;
        if (player.run.game.pendingEvent)
          player.run = (
            await call(`/api/games/${player.run.id}/action`, player.cookie, {
              requestId: randomUUID(),
              action: { type: "acknowledge-event" },
            })
          ).value;
      }),
    );
  assert.equal(new Set(players.map((p) => p.run.id)).size, 20);
  for (const p of players) {
    assert.equal(p.run.game.elapsedMonths, 12);
    assert.equal(p.run.game.history.length, 13);
  }
  latencies.sort((a, b) => a - b);
  console.log(
    JSON.stringify(
      {
        independentPlayers: 20,
        monthsPerPlayer: 12,
        totalRequests: latencies.length,
        durationMs: Math.round(performance.now() - started),
        requestP95Ms: Math.round(
          latencies[Math.floor(latencies.length * 0.95)],
        ),
        maximumRequestMs: Math.round(latencies.at(-1)),
        scope:
          "Local short-run concurrency exercise, one Node.js process; not a public-production capacity guarantee",
      },
      null,
      2,
    ),
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
