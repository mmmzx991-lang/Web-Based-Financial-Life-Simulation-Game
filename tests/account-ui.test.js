import test from "node:test";
import assert from "node:assert/strict";
import { switchUser } from "../public/account-state.js";
test("switching account identity clears the previous private game and list", () => {
  const state = {
    user: { id: "guest-a" },
    session: { id: "private-a" },
    games: [{ id: "private-a" }],
    entries: [],
  };
  assert.equal(switchUser(state, { id: "account-b" }), true);
  assert.equal(state.session, null);
  assert.deepEqual(state.games, []);
  assert.equal(state.user.id, "account-b");
});
test("upgrading the same guest identity preserves its current game", () => {
  const state = {
    user: { id: "guest-a", guest: true },
    session: { id: "private-a" },
    games: [{ id: "private-a" }],
  };
  assert.equal(switchUser(state, { id: "guest-a", guest: false }), false);
  assert.equal(state.session.id, "private-a");
  assert.equal(state.games.length, 1);
});
