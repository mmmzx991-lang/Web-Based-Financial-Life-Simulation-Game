import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  openSync,
  fsyncSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// One atomic snapshot keeps a state transition and its replay response together.
// Individual v1 anonymous files are deliberately never read or imported.
export function createStore(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const path = join(dataDir, "v2-state.json");
  let state = { version: 2, users: {}, sessions: {}, games: {} };
  if (existsSync(path)) {
    state = JSON.parse(readFileSync(path, "utf8"));
    if (state.version !== 2 || !state.users || !state.sessions || !state.games)
      throw new Error("Invalid v2 data repository");
  }
  function commit(change) {
    const next = structuredClone(state);
    const result = change(next);
    const temporary = join(dataDir, `.v2-${randomUUID()}.tmp`);
    let descriptor;
    try {
      descriptor = openSync(temporary, "wx", 0o600);
      writeFileSync(descriptor, JSON.stringify(next));
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temporary, path);
      state = next;
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      if (existsSync(temporary)) unlinkSync(temporary);
    }
    return result;
  }
  return {
    user(id) {
      return state.users[id];
    },
    userByEmail(email) {
      return Object.values(state.users).find(
        (user) => !user.guest && user.email === email,
      );
    },
    session(hash) {
      return state.sessions[hash];
    },
    game(id) {
      return state.games[id];
    },
    games() {
      return Object.values(state.games);
    },
    commit,
  };
}
