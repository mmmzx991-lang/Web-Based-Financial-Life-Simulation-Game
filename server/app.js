import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, relative, extname, isAbsolute } from "node:path";
import * as core from "./core/simulation.js";
import * as config from "./core/config.js";
import { createStore } from "./store.js";
import {
  httpError,
  normalizeEmail,
  normalizeName,
  validatePassword,
  hashPassword,
  verifyPassword,
  publicUser,
  requestSession,
  newSession,
  sessionCookie,
  assertSameOrigin,
  createAuthThrottle,
} from "./auth.js";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
async function body(req) {
  const chunks = [];
  let length = 0;
  if (Number(req.headers["content-length"]) > 16384)
    throw httpError(413, "Request too large", "BODY_TOO_LARGE");
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 16384)
      throw httpError(413, "Request too large", "BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw httpError(400, "Invalid JSON body", "INVALID_JSON");
  }
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw httpError(400, "Expected JSON object", "INVALID_JSON");
  return value;
}
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
function serveStatic(path, res) {
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  if (
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    decoded.includes(":") ||
    decoded.split("/").includes("..")
  )
    return false;
  const file = resolve(
    publicDir,
    decoded === "/" ? "index.html" : decoded.slice(1),
  );
  const type = mime[extname(file).toLowerCase()];
  if (!type) return false;
  try {
    const actual = realpathSync(file),
      rel = relative(realpathSync(publicDir), actual);
    if (rel.startsWith("..") || isAbsolute(rel) || !statSync(actual).isFile())
      return false;
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    res.end(readFileSync(actual));
    return true;
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "EINVAL", "EACCES"].includes(error.code))
      return false;
    throw error;
  }
}
export function createApp({
  dataDir = fileURLToPath(new URL("../data/", import.meta.url)),
} = {}) {
  const store = createStore(dataDir),
    throttle = createAuthThrottle();
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    const send = (status, value) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    const currentAuth = () => requestSession(req, store);
    const requireUser = () => {
      const auth = currentAuth();
      if (!auth)
        throw httpError(
          401,
          "Please sign in or continue as a guest",
          "AUTH_REQUIRED",
        );
      return auth.user;
    };
    try {
      const url = new URL(req.url, "http://localhost"),
        path = url.pathname;
      if (req.method === "POST") assertSameOrigin(req);
      if (req.method === "GET" && !path.startsWith("/api/")) {
        if (serveStatic(path, res)) return;
        return send(404, { error: "Not found", code: "NOT_FOUND" });
      }
      if (path === "/api/health" && req.method === "GET")
        return send(200, { status: "ok", version: 2 });
      if (path === "/api/config" && req.method === "GET")
        return send(200, {
          modes: config.MODES,
          difficulties: config.DIFFICULTIES,
          rulesets: config.RULESETS,
          assets: config.ASSETS,
          propertyTypes: config.PROPERTY_TYPES,
          businessTypes: config.BUSINESS_TYPES,
          settings: config.SETTINGS,
          tradeFeeRate: config.SETTINGS?.tradeFee,
          migrationNote:
            "Anonymous v1 saves are not imported. Start a new v2 game with an account or guest session.",
        });
      if (path === "/api/auth/me" && req.method === "GET")
        return send(200, { user: publicUser(currentAuth()?.user) });
      const authRoute = path.match(
        /^\/api\/auth\/(register|login|guest|logout)$/,
      );
      if (authRoute && req.method === "POST") {
        const endpoint = authRoute[1];
        // Apply the per-address guard before reading and hashing user input.
        if (endpoint !== "logout") throttle(req, endpoint);
        const input = await body(req);
        const previous = currentAuth();
        if (endpoint === "logout") {
          if (previous)
            store.commit((next) => {
              delete next.sessions[previous.hash];
            });
          res.setHeader("Set-Cookie", sessionCookie(req, "", 0));
          return send(200, { user: null });
        }
        let user;
        if (endpoint === "register") {
          const displayName = normalizeName(input.displayName),
            email = normalizeEmail(input.email),
            password = validatePassword(input.password);
          if (store.userByEmail(email))
            throw httpError(
              409,
              "Email address is already registered",
              "EMAIL_EXISTS",
            );
          const credential = await hashPassword(password);
          // Recheck after asynchronous scrypt: simultaneous registrations may finish together.
          if (store.userByEmail(email))
            throw httpError(
              409,
              "Email address is already registered",
              "EMAIL_EXISTS",
            );
          const guest = currentAuth()?.user;
          user = {
            id: guest?.guest ? guest.id : randomUUID(),
            displayName,
            email,
            guest: false,
            credential,
            createdAt: guest?.guest
              ? guest.createdAt
              : new Date().toISOString(),
          };
        } else if (endpoint === "login") {
          const email = normalizeEmail(input.email),
            password = validatePassword(input.password);
          // The identifier bucket is separate so 20 independent players can share a host.
          throttle(req, "credential", email);
          user = store.userByEmail(email);
          if (!(await verifyPassword(password, user?.credential)))
            throw httpError(
              401,
              "Invalid email or password",
              "INVALID_CREDENTIALS",
            );
        } else {
          const id = randomUUID();
          user = {
            id,
            displayName: `Guest ${id.slice(0, 6)}`,
            guest: true,
            createdAt: new Date().toISOString(),
          };
        }
        const session = newSession(user.id);
        store.commit((next) => {
          if (
            endpoint === "register" &&
            Object.values(next.users).some(
              (account) => account.email === user.email && !account.guest,
            )
          )
            throw httpError(
              409,
              "Email address is already registered",
              "EMAIL_EXISTS",
            );
          next.users[user.id] = user;
          if (previous) delete next.sessions[previous.hash];
          for (const [hash, value] of Object.entries(next.sessions))
            if (value.expiresAt <= Date.now()) delete next.sessions[hash];
          next.sessions[session.hash] = session.value;
        });
        res.setHeader("Set-Cookie", sessionCookie(req, session.token));
        return send(
          endpoint === "register" || endpoint === "guest" ? 201 : 200,
          { user: publicUser(user) },
        );
      }
      if (path === "/api/leaderboard" && req.method === "GET") {
        const mode = url.searchParams.get("mode"),
          difficulty = url.searchParams.get("difficulty");
        if (mode && !Object.hasOwn(config.MODES, mode))
          throw httpError(400, "Invalid life mode", "INVALID_MODE");
        if (difficulty && !Object.hasOwn(config.DIFFICULTIES, difficulty))
          throw httpError(400, "Invalid difficulty", "INVALID_DIFFICULTY");
        const best = new Map();
        for (const record of store.games()) {
          const game = record.game;
          if (
            game.version !== 2 ||
            (game.marketVersion ?? 2) !== 3 ||
            game.ruleset !== "standard" ||
            game.status !== "completed" ||
            game.ageMonths < game.endAgeMonths ||
            (mode && game.mode !== mode) ||
            (difficulty && game.difficulty !== difficulty)
          )
            continue;
          const summary = core.report(game),
            user = store.user(record.ownerId);
          if (!user || !summary.completed || summary.bankrupt) continue;
          const entry = {
            displayName: user.displayName,
            mode: game.mode,
            difficulty: game.difficulty,
            score: summary.score,
            realNetWorth: summary.realNetWorth,
            monthsPlayed: summary.monthsPlayed,
            completedAt: record.updatedAt,
          };
          const key = `${record.ownerId}:${game.mode}:${game.difficulty}`,
            previous = best.get(key);
          if (
            !previous ||
            entry.score.total > previous.score.total ||
            (entry.score.total === previous.score.total &&
              entry.realNetWorth > previous.realNetWorth)
          )
            best.set(key, entry);
        }
        const entries = [...best.values()]
          .sort(
            (a, b) =>
              b.score.total - a.score.total ||
              b.realNetWorth - a.realNetWorth ||
              a.completedAt.localeCompare(b.completedAt),
          )
          .slice(0, 100);
        return send(200, { entries });
      }
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
        const input = await body(req),
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
      const input = await body(req);
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
    } catch (error) {
      const internal =
        !error.status &&
        (error.code ||
          error instanceof TypeError ||
          error instanceof RangeError);
      return send(error.status || (internal ? 500 : 400), {
        error: internal ? "Server operation failed" : error.message,
        code: error.status
          ? error.code
          : internal
            ? "INTERNAL_ERROR"
            : "INVALID_ACTION",
      });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
