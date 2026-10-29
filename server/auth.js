import {
  randomBytes,
  createHash,
  scrypt as nativeScrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nativeScrypt);
export const SESSION_COOKIE = "investment_session";
export const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const DUMMY_SALT = "00000000000000000000000000000000";
const DUMMY_HASH = Buffer.alloc(64);
export function httpError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}
export function normalizeEmail(value) {
  if (typeof value !== "string")
    throw httpError(400, "A valid email address is required", "INVALID_EMAIL");
  const email = value.trim().normalize("NFC").toLowerCase();
  if (
    email.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
      email,
    )
  )
    throw httpError(400, "A valid email address is required", "INVALID_EMAIL");
  return email;
}
export function normalizeName(value) {
  if (typeof value !== "string")
    throw httpError(
      400,
      "Display name must be 2–40 characters",
      "INVALID_NAME",
    );
  if (/[\p{Cc}\p{Cf}]/u.test(value))
    throw httpError(
      400,
      "Display name contains invalid characters",
      "INVALID_NAME",
    );
  const name = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if ([...name].length < 2 || [...name].length > 40)
    throw httpError(
      400,
      "Display name must be 2–40 characters",
      "INVALID_NAME",
    );
  return name;
}
export function validatePassword(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 256)
    throw httpError(
      400,
      "Password must be 8–256 characters",
      "INVALID_PASSWORD",
    );
  return value;
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64, SCRYPT_OPTIONS);
  return { algorithm: "scrypt", salt, hash: hash.toString("hex") };
}
export async function verifyPassword(password, credential) {
  const actual = await scrypt(
    password,
    credential?.salt || DUMMY_SALT,
    64,
    SCRYPT_OPTIONS,
  );
  const expected = credential
    ? Buffer.from(credential.hash, "hex")
    : DUMMY_HASH;
  return (
    expected.length === actual.length &&
    timingSafeEqual(actual, expected) &&
    !!credential
  );
}
export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
    ...(!user.guest ? { email: user.email } : {}),
    guest: !!user.guest,
  };
}
export function sessionHash(token) {
  return createHash("sha256").update(token).digest("hex");
}
export function requestSession(req, store) {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  const token = cookie?.slice(SESSION_COOKIE.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = sessionHash(token),
    session = store.session(hash);
  if (!session || session.expiresAt <= Date.now()) return null;
  const user = store.user(session.userId);
  return user ? { hash, user, session } : null;
}
export function newSession(userId) {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    hash: sessionHash(token),
    value: { userId, expiresAt: Date.now() + SESSION_TTL },
  };
}
export function sessionCookie(req, token, maxAge = SESSION_TTL / 1000) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${req.socket.encrypted ? "; Secure" : ""}`;
}
export function assertSameOrigin(req) {
  if (req.headers["sec-fetch-site"] === "cross-site")
    throw httpError(
      403,
      "Cross-origin requests are not allowed",
      "CROSS_ORIGIN",
    );
  if (req.headers.origin !== undefined) {
    const expected = `${req.socket.encrypted ? "https" : "http"}://${req.headers.host}`;
    let origin;
    try {
      origin = new URL(req.headers.origin).origin;
    } catch {
      throw httpError(
        403,
        "Cross-origin requests are not allowed",
        "CROSS_ORIGIN",
      );
    }
    if (origin !== expected)
      throw httpError(
        403,
        "Cross-origin requests are not allowed",
        "CROSS_ORIGIN",
      );
  }
  if (
    !/^application\/json(?:\s*;|\s*$)/i.test(req.headers["content-type"] || "")
  )
    throw httpError(
      415,
      "Content-Type must be application/json",
      "JSON_REQUIRED",
    );
}
export function createAuthThrottle() {
  const buckets = new Map(),
    windowMs = 10 * 60 * 1000;
  return (req, endpoint, email) => {
    const now = Date.now();
    for (const [key, bucket] of buckets)
      if (bucket.until <= now) buckets.delete(key);
    const ip = req.socket.remoteAddress || "unknown";
    const keys = [
      [
        `${endpoint}:${ip}`,
        endpoint === "login" ? 30 : endpoint === "register" ? 40 : 60,
      ],
    ];
    if (endpoint === "credential" && email)
      keys.push([`login-email:${email}`, 10]);
    for (const [key, limit] of keys) {
      const bucket = buckets.get(key);
      if (bucket && bucket.count >= limit)
        throw httpError(
          429,
          "Too many authentication attempts. Please try again later.",
          "AUTH_THROTTLED",
        );
    }
    // Bound attacker-controlled identifiers while allowing independent local players.
    if (buckets.size > 10000)
      throw httpError(
        429,
        "Too many authentication attempts. Please try again later.",
        "AUTH_THROTTLED",
      );
    for (const [key] of keys) {
      const bucket = buckets.get(key) || { until: now + windowMs, count: 0 };
      bucket.count++;
      buckets.set(key, bucket);
    }
  };
}
