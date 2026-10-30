import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createStore } from "../server/store.js";
import { createApp } from "../server/app.js";
import { createGame } from "../server/core/simulation.js";
import {
  sessionCookie,
  hashPassword,
  verifyPassword,
  SESSION_COOKIE,
} from "../server/auth.js";

function directory(t) {
  const path = mkdtempSync(join(process.cwd(), ".test-repository-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}
test("v2 repository ignores anonymous legacy files and publishes complete snapshots atomically", (t) => {
  const path = directory(t),
    legacyId = randomUUID();
  writeFileSync(
    join(path, `${legacyId}.json`),
    JSON.stringify({ version: 1, cash: 999999 }),
  );
  const store = createStore(path);
  assert.equal(store.games().length, 0);
  assert.equal(store.game(legacyId), undefined);
  store.commit((next) => {
    next.users.example = { id: "example", displayName: "Example", guest: true };
  });
  const before = readFileSync(join(path, "v2-state.json"), "utf8");
  assert.throws(() =>
    store.commit((next) => {
      next.users.example.displayName = "Lost update";
      throw new Error("Aborted");
    }),
  );
  assert.equal(store.user("example").displayName, "Example");
  assert.equal(readFileSync(join(path, "v2-state.json"), "utf8"), before);
  assert.equal(createStore(path).user("example").displayName, "Example");
  assert.ok(!readdirSync(path).some((name) => name.endsWith(".tmp")));
});

test("password derivation has unique salts and verifies without revealing raw credentials; TLS cookies are Secure", async () => {
  const first = await hashPassword("a strong local password"),
    second = await hashPassword("a strong local password");
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(await verifyPassword("a strong local password", first), true);
  assert.equal(await verifyPassword("incorrect password", first), false);
  assert.equal(
    await verifyPassword("a strong local password", undefined),
    false,
  );
  assert.match(
    sessionCookie({ socket: { encrypted: true } }, "abc"),
    new RegExp(`^${SESSION_COOKIE}=abc;.*; Secure$`),
  );
  assert.doesNotMatch(sessionCookie({ socket: {} }, "abc"), /Secure/);
});

test("leaderboards publish one best completed Standard result per account/category and no private credentials", async (t) => {
  const path = directory(t),
    store = createStore(path);
  const first = randomUUID(),
    second = randomUUID();
  store.commit((next) => {
    next.users[first] = {
      id: first,
      displayName: "First Player",
      guest: false,
      email: "first@example.test",
      credential: { hash: "secret" },
    };
    next.users[second] = {
      id: second,
      displayName: "Second Player",
      guest: false,
      email: "second@example.test",
    };
    function add(ownerId, options = {}, overrides = {}) {
      const game = createGame({
        mode: "early-career",
        difficulty: "easy",
        ruleset: "standard",
        ...options,
      });
      Object.assign(game, {
        version: 2,
        status: "completed",
        ageMonths: game.endAgeMonths,
        elapsedMonths: game.endAgeMonths - game.startAgeMonths,
        ...overrides,
      });
      const id = randomUUID();
      next.games[id] = {
        id,
        ownerId,
        game,
        updatedAt: new Date().toISOString(),
        actions: {},
      };
    }
    add(first, {}, { cash: 10000000 });
    add(first, {}, { cash: 30000000 });
    add(second, {}, { cash: 20000000 });
    add(first, { mode: "wealth-building" }, { cash: 25000000 });
    add(first, { difficulty: "hard" }, { cash: 15000000 });
    add(first, { ruleset: "free" }, { cash: 999999999999 });
    add(second, {}, { status: "active", ageMonths: 300, cash: 999999999999 });
    add(second, {}, { status: "bankrupt", cash: 999999999999 });
    add(second, {}, { marketVersion: 3, cash: 999999999999 });
  });
  const server = createApp({ dataDir: path });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(
    base + "/api/leaderboard?mode=early-career&difficulty=easy",
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.entries.length, 2);
  assert.deepEqual(
    data.entries.map((entry) => entry.displayName),
    ["First Player", "Second Player"],
  );
  assert.equal(data.entries[0].realNetWorth, 30000000);
  assert.ok(!JSON.stringify(data).includes("secret"));
  assert.ok(!JSON.stringify(data).includes("@"));
  const all = await (await fetch(base + "/api/leaderboard")).json();
  assert.equal(all.entries.length, 4);
  assert.equal(
    (await fetch(base + "/api/leaderboard?mode=invalid")).status,
    400,
  );
});
