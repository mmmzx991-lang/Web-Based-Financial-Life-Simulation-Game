import { randomUUID } from "node:crypto";
import * as core from "./core/simulation.js";
import { httpError } from "./auth.js";
import { readJsonObject } from "./request-body.js";

const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function owner(store, id, userId) {
  const record = store.game(id);
  if (!record || record.ownerId !== userId)
    throw httpError(404, "Game not found", "GAME_NOT_FOUND");
  return record;
}
function result(record) {
  return {
    id: record.id,
    game: record.game,
    summary: core.report(record.game),
  };
}
function compactResponse(response) {
  const { history, ...game } = response.game;
  const { history: summaryHistory, ...summary } = response.summary;
  return {
    id: response.id,
    game,
    summary,
    historyLength: history.length,
    summaryHasHistory: Array.isArray(summaryHistory),
  };
}
function replayResponse(replay, currentGame) {
  const history = currentGame.history.slice(0, replay.historyLength);
  return {
    id: replay.id,
    game: { ...replay.game, history },
    summary: {
      ...replay.summary,
      ...(replay.summaryHasHistory ? { history } : {}),
    },
  };
}

export async function handleGameRequest(req, path, { store, requireUser, send }) {
  if (path === "/api/games" && req.method === "GET") {
    const user = requireUser();
    const games = store
      .games()
      .filter((record) => record.ownerId === user.id)
      .map((record) => ({
        id: record.id,
        mode: record.game.mode,
        difficulty: record.game.difficulty,
        ruleset: record.game.ruleset,
        status: record.game.status,
        ageMonths: record.game.ageMonths,
        updatedAt: record.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return send(200, { games });
  }
  if (path === "/api/games" && req.method === "POST") {
    requireUser();
    const input = await readJsonObject(req),
      user = requireUser();
    const options = {};
    for (const field of ["mode", "difficulty", "ruleset"])
      if (Object.hasOwn(input, field)) options[field] = input[field];
    const game = core.createGame(options),
      id = randomUUID(),
      now = new Date().toISOString();
    const record = {
      id,
      ownerId: user.id,
      createdAt: now,
      updatedAt: now,
      game,
      actions: {},
    };
    const response = result(record);
    store.commit((next) => {
      next.games[id] = record;
    });
    return send(201, response);
  }
  const match = path.match(
    /^\/api\/games\/([a-f0-9-]{36})(?:\/(action|save|report))?$/i,
  );
  if (!match) return send(404, { error: "Not found", code: "NOT_FOUND" });
  const [, id, route] = match;
  let user = requireUser(),
    record = owner(store, id, user.id);
  if (req.method === "GET" && !route) return send(200, result(record));
  if (req.method === "GET" && route === "report")
    return send(200, core.report(record.game));
  if (req.method !== "POST" || !["action", "save"].includes(route))
    return send(405, {
      error: "Method not allowed",
      code: "METHOD_NOT_ALLOWED",
    });
  const input = await readJsonObject(req);
  // Read identity and game only after the complete body, then settle without awaits.
  user = requireUser();
  record = owner(store, id, user.id);
  if (route === "save")
    return send(200, { saved: true, ...result(record) });
  if (typeof input.requestId !== "string" || !uuid.test(input.requestId))
    throw httpError(
      400,
      "A UUID requestId is required",
      "INVALID_REQUEST_ID",
    );
  if (
    !input.action ||
    Array.isArray(input.action) ||
    typeof input.action !== "object" ||
    typeof input.action.type !== "string"
  )
    throw httpError(
      400,
      "A game action object is required",
      "INVALID_ACTION",
    );
  const requestId = input.requestId.toLowerCase();
  if (Object.hasOwn(record.actions, requestId))
    return send(
      200,
      replayResponse(record.actions[requestId], record.game),
    );
  const nextGame = core.act(record.game, input.action);
  const response = { id, game: nextGame, summary: core.report(nextGame) };
  store.commit((next) => {
    const nextRecord = next.games[id];
    nextRecord.game = nextGame;
    nextRecord.updatedAt = new Date().toISOString();
    nextRecord.actions[requestId] = compactResponse(response);
  });
  return send(200, response);
}
