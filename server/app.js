import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as core from "./core/simulation.js";
import * as config from "./core/config.js";
import { createStore } from "./store.js";
import { handleGameRequest } from "./game-routes.js";
import { readJsonObject } from "./request-body.js";
import { serveStatic } from "./static-files.js";
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
        const input = await readJsonObject(req);
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
            (game.marketVersion ?? 2) !== 4 ||
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
      return await handleGameRequest(req, path, { store, requireUser, send });
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
