import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { request } from "node:http";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.js";

async function fixture(t) {
  const directory = mkdtempSync(join(process.cwd(), ".test-accounts-"));
  const servers = [];
  const context = { directory, servers, base: "" };
  context.start = async () => {
    if (servers.at(-1)?.listening)
      await new Promise((resolve) => servers.at(-1).close(resolve));
    const server = createApp({ dataDir: directory });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    context.base = `http://127.0.0.1:${server.address().port}`;
  };
  context.client = () => {
    let cookie = "";
    const call = async (path, method = "GET", body, headers = {}) => {
      const response = await fetch(context.base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      return {
        status: response.status,
        body: await response.json(),
        headers: response.headers,
      };
    };
    return {
      call,
      get cookie() {
        return cookie;
      },
    };
  };
  t.after(async () => {
    await Promise.all(
      servers
        .filter((server) => server.listening)
        .map((server) => new Promise((resolve) => server.close(resolve))),
    );
    rmSync(directory, { recursive: true, force: true });
  });
  await context.start();
  return context;
}

test("account credentials are normalized, hashed, private and durable; logout revokes sessions", async (t) => {
  const f = await fixture(t),
    a = f.client(),
    b = f.client();
  assert.deepEqual((await a.call("/api/auth/me")).body, { user: null });
  const registered = await a.call("/api/auth/register", "POST", {
    displayName: "  Alice   Investor ",
    email: " ALICE@Example.COM ",
    password: "correct horse battery",
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.user.displayName, "Alice Investor");
  assert.equal(registered.body.user.email, "alice@example.com");
  assert.equal(registered.body.user.guest, false);
  assert.match(registered.headers.get("set-cookie"), /HttpOnly/);
  assert.match(registered.headers.get("set-cookie"), /SameSite=Lax/);
  assert.match(registered.headers.get("set-cookie"), /Max-Age=/);
  assert.doesNotMatch(JSON.stringify(registered.body), /password|salt|hash/i);
  const disk = readFileSync(join(f.directory, "v2-state.json"), "utf8");
  assert.ok(!disk.includes("correct horse battery"));
  assert.ok(!disk.includes(a.cookie.split("=")[1]));
  assert.match(disk, /scrypt/);
  assert.equal(
    (
      await b.call("/api/auth/register", "POST", {
        displayName: "Someone",
        email: "alice@example.com",
        password: "abcdefgh",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await b.call("/api/auth/login", "POST", {
        email: "alice@example.com",
        password: "wrongpass",
      })
    ).status,
    401,
  );
  await f.start();
  assert.equal(
    (await a.call("/api/auth/me")).body.user.id,
    registered.body.user.id,
  );
  assert.equal(
    (
      await b.call("/api/auth/login", "POST", {
        email: "ALICE@example.com",
        password: "correct horse battery",
      })
    ).status,
    200,
  );
  const oldCookie = a.cookie;
  assert.equal((await a.call("/api/auth/logout", "POST", {})).body.user, null);
  const response = await fetch(f.base + "/api/auth/me", {
    headers: { Cookie: oldCookie },
  });
  assert.equal((await response.json()).user, null);
});

test("twenty concurrent accounts own isolated autosaved games, with persistent exact action replay", async (t) => {
  const f = await fixture(t);
  const players = await Promise.all(
    Array.from({ length: 20 }, async (_, i) => {
      const client = f.client();
      const account = await client.call("/api/auth/register", "POST", {
        displayName: `Player ${i}`,
        email: `player${i}@example.test`,
        password: "educational password",
      });
      assert.equal(account.status, 201);
      const result = await client.call("/api/games", "POST", {
        mode: "early-career",
        difficulty: "easy",
        ruleset: "standard",
      });
      assert.equal(result.status, 201);
      return { client, id: result.body.id };
    }),
  );
  assert.equal(new Set(players.map((player) => player.id)).size, 20);
  await Promise.all(
    players.map(async ({ client, id }, index) => {
      const deposit = await client.call(`/api/games/${id}/action`, "POST", {
        requestId: randomUUID(),
        action: { type: "savings-deposit", amount: (index + 1) * 10000 },
      });
      assert.equal(deposit.status, 200);
      assert.equal(deposit.body.game.savings, (index + 1) * 10000);
    }),
  );
  const [{ client: a, id }, { client: b }] = players;
  for (const suffix of ["", "/report"])
    assert.equal((await b.call(`/api/games/${id}${suffix}`)).status, 404);
  assert.equal(
    (
      await b.call(`/api/games/${id}/action`, "POST", {
        requestId: randomUUID(),
        action: { type: "advance", months: 1 },
      })
    ).status,
    404,
  );
  assert.equal((await b.call(`/api/games/${id}/save`, "POST", {})).status, 404);
  assert.deepEqual(
    (await a.call("/api/games")).body.games.map((g) => g.id),
    [id],
  );
  const requestId = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      a.call(`/api/games/${id}/action`, "POST", {
        requestId,
        action: { type: "advance", months: 1 },
      }),
    ),
  );
  for (const result of results) {
    assert.equal(result.status, 200);
    assert.equal(result.body.game.elapsedMonths, 1);
  }
  await a.call(`/api/games/${id}/action`, "POST", {
    requestId: randomUUID(),
    action: { type: "advance", months: 1 },
  });
  await f.start();
  const replay = await a.call(`/api/games/${id}/action`, "POST", {
    requestId,
    action: { type: "advance", months: 3 },
  });
  assert.deepEqual(replay.body, results[0].body);
  assert.equal((await a.call(`/api/games/${id}`)).body.game.elapsedMonths, 2);
  assert.equal(
    (await players[1].client.call(`/api/games/${players[1].id}`)).body.game
      .elapsedMonths,
    0,
  );
  assert.equal((await a.call(`/api/games/${id}/report`)).body.monthsPlayed, 2);
});

test("registering from a guest session upgrades that identity and preserves saved games", async (t) => {
  const f = await fixture(t),
    a = f.client();
  const guest = (await a.call("/api/auth/guest", "POST", {})).body.user;
  const id = (await a.call("/api/games", "POST", {})).body.id;
  const registered = await a.call("/api/auth/register", "POST", {
    displayName: "Persistent Player",
    email: "upgrade@example.test",
    password: "educational password",
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.user.guest, false);
  assert.equal(registered.body.user.id, guest.id);
  await f.start();
  assert.equal((await a.call(`/api/games/${id}`)).status, 200);
  assert.equal((await a.call("/api/games")).body.games[0].id, id);
});

test("a slowly delivered action settles against the latest saved state", async (t) => {
  const f = await fixture(t),
    a = f.client();
  await a.call("/api/auth/guest", "POST", {});
  const id = (await a.call("/api/games", "POST", {})).body.id;
  const received = new Promise((resolve) =>
    f.servers[0].once("request", resolve),
  );
  let finish;
  const slow = new Promise((resolve, reject) => {
    const req = request(
      f.base + `/api/games/${id}/action`,
      {
        method: "POST",
        headers: { Cookie: a.cookie, "Content-Type": "application/json" },
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => resolve(JSON.parse(text)));
      },
    );
    req.on("error", reject);
    req.write(`{"requestId":"${randomUUID()}","action":`);
    finish = () => req.end('{"type":"advance","months":1}}');
  });
  await received;
  let fast;
  try {
    fast = await a.call(`/api/games/${id}/action`, "POST", {
      requestId: randomUUID(),
      action: { type: "advance", months: 1 },
    });
  } finally {
    finish();
  }
  const settled = await slow;
  assert.equal(fast.status, 200);
  assert.equal(settled.game.elapsedMonths, 2);
});

test("invalid bodies, cross-origin mutations, expired sessions, static traversal and throttled authentication", async (t) => {
  const f = await fixture(t),
    a = f.client();
  assert.equal((await a.call("/api/games", "POST", {})).status, 401);
  assert.equal(
    (
      await a.call(
        "/api/auth/guest",
        "POST",
        {},
        { Origin: "https://hostile.example" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await a.call(
        "/api/auth/guest",
        "POST",
        {},
        { "Sec-Fetch-Site": "cross-site" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(f.base + "/api/auth/guest", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      })
    ).status,
    415,
  );
  for (const bad of [
    { displayName: "x", email: "a@b.test", password: "abcdefgh" },
    { displayName: "Alice", email: "bad", password: "abcdefgh" },
    { displayName: "Alice", email: "a@b.test", password: "short" },
  ]) {
    assert.equal((await a.call("/api/auth/register", "POST", bad)).status, 400);
  }
  await a.call("/api/auth/guest", "POST", {});
  const id = (await a.call("/api/games", "POST", {})).body.id;
  assert.equal(
    (
      await a.call(`/api/games/${id}/action`, "POST", {
        action: { type: "advance", months: 1 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await a.call(`/api/games/${id}/action`, "POST", {
        requestId: randomUUID(),
        action: [],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await a.call(`/api/games/${id}/action`, "POST", {
        requestId: randomUUID(),
        action: { type: "advance", months: 2 },
      })
    ).status,
    400,
  );
  for (const body of ["{", "[]", "null"])
    assert.equal(
      (
        await fetch(f.base + "/api/games", {
          method: "POST",
          headers: { Cookie: a.cookie, "Content-Type": "application/json" },
          body,
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await fetch(f.base + "/api/games", {
        method: "POST",
        headers: { Cookie: a.cookie, "Content-Type": "application/json" },
        body: "x".repeat(20000),
      })
    ).status,
    413,
  );
  const chunked = await new Promise((resolve, reject) => {
    const req = request(
      f.base + "/api/games",
      {
        method: "POST",
        headers: {
          Cookie: a.cookie,
          "Content-Type": "application/json",
          "Transfer-Encoding": "chunked",
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    for (let i = 0; i < 6; i++) req.write("x".repeat(4000));
    req.end();
  });
  assert.equal(chunked, 413);
  const streaming = await new Promise((resolve, reject) => {
    const req = request(
      f.base + "/api/games",
      {
        method: "POST",
        headers: { Cookie: a.cookie, "Content-Type": "application/json" },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    req.write("x".repeat(20000));
    setTimeout(() => req.end(), 30);
  });
  assert.equal(streaming, 413);
  assert.equal((await fetch(f.base + "/%2e%2e%2fserver%2fapp.js")).status, 404);
  const page = await fetch(f.base + "/");
  assert.equal(page.status, 200);
  assert.ok(page.headers.get("content-security-policy"));
  for (const path of [
    "/app.js",
    "/styles.css",
    "/i18n.js",
    "/views.js",
    "/charts.js",
    "/game-world.svg",
  ])
    assert.equal((await fetch(f.base + path)).status, 200);
  const state = JSON.parse(
    readFileSync(join(f.directory, "v2-state.json"), "utf8"),
  );
  for (const session of Object.values(state.sessions)) session.expiresAt = 0;
  writeFileSync(join(f.directory, "v2-state.json"), JSON.stringify(state));
  await f.start();
  assert.equal((await a.call("/api/auth/me")).body.user, null);
  const statuses = [];
  for (let i = 0; i < 15; i++)
    statuses.push(
      (
        await a.call("/api/auth/login", "POST", {
          email: "missing@example.com",
          password: "wrongpass",
        })
      ).status,
    );
  assert.ok(statuses.includes(429));
});
