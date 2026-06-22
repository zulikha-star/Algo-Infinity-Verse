import crypto from "crypto";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const PBKDF2_ITERATIONS = 210000;
const PASSWORD_KEY_LENGTH = 32;

// ── Rate limiting ────────────────────────────────────────────────────────────
const SIGNUP_RATE_LIMIT = 5;
const SIGNUP_WINDOW_MS = 15 * 60 * 1000;
const signupAttempts = new Map();

export const _signupSweeper = setInterval(() => {
  const now = Date.now();
  for (const [identifier, timestamps] of signupAttempts) {
    const fresh = timestamps.filter((t) => now - t < SIGNUP_WINDOW_MS);
    if (fresh.length === 0) {
      signupAttempts.delete(identifier);
    } else {
      signupAttempts.set(identifier, fresh);
    }
  }
}, SIGNUP_WINDOW_MS);

if (_signupSweeper.unref) _signupSweeper.unref();

const TRUSTED_PROXIES = new Set(
  (process.env.TRUSTED_PROXIES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

export function getClientIdentifier(req) {
  const remoteAddress = req.socket?.remoteAddress || "unknown";

  if (
    remoteAddress !== "unknown" &&
    TRUSTED_PROXIES.has(remoteAddress) &&
    req.headers["x-forwarded-for"]
  ) {
    const leftmost = req.headers["x-forwarded-for"].split(",")[0].trim();
    if (leftmost) return leftmost;
  }

  return remoteAddress;
}

export function isSignupRateLimited(identifier) {
  const now = Date.now();
  const attempts = signupAttempts.get(identifier) || [];
  const recentAttempts = attempts.filter((t) => now - t < SIGNUP_WINDOW_MS);
  signupAttempts.set(identifier, recentAttempts);
  return recentAttempts.length >= SIGNUP_RATE_LIMIT;
}

export function recordSignupAttempt(identifier) {
  const now = Date.now();
  const attempts = signupAttempts.get(identifier) || [];
  const recentAttempts = attempts.filter((t) => now - t < SIGNUP_WINDOW_MS);
  recentAttempts.push(now);
  signupAttempts.set(identifier, recentAttempts);
}

export async function normalizeAuthDelay() {
  return new Promise((resolve) => setTimeout(resolve, 500));
}

// ── Authentication & Tokens ──────────────────────────────────────────────────
function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64Url(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production.");
  }
  return "dev-only-change-me-with-SESSION_SECRET-before-deploying";
}

function sign(value) {
  return crypto
    .createHmac("sha256", sessionSecret())
    .update(value)
    .digest("base64url");
}

export function createSessionToken(user) {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      sub: user.id,
      name: user.name,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
    }),
  );
  const body = `${header}.${payload}`;
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const body = `${header}.${payload}`;
  const expected = sign(body);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const session = JSON.parse(fromBase64Url(payload));
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000))
      return null;
    return session;
  } catch {
    return null;
  }
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto
    .pbkdf2Sync(
      password,
      salt,
      PBKDF2_ITERATIONS,
      PASSWORD_KEY_LENGTH,
      "sha256",
    )
    .toString("hex");
  return { salt, hash, iterations: PBKDF2_ITERATIONS, digest: "sha256" };
}

export function passwordMatches(password, stored) {
  const calculated = crypto.pbkdf2Sync(
    password,
    stored.salt,
    stored.iterations || PBKDF2_ITERATIONS,
    PASSWORD_KEY_LENGTH,
    stored.digest || "sha256",
  );
  const saved = Buffer.from(stored.hash, "hex");
  return (
    saved.length === calculated.length &&
    crypto.timingSafeEqual(saved, calculated)
  );
}

export function validateSignup({ name, email, password, confirmPassword }) {
  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "")
    .trim()
    .toLowerCase();
  const rawPassword = String(password || "");
  const rawConfirm = String(confirmPassword || "");

  if (cleanName.length < 2) return "Name must be at least 2 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return "Enter a valid email address.";
  }
  if (rawPassword.length < 8) return "Password must be at least 8 characters.";
  if (
    !/[a-z]/.test(rawPassword) ||
    !/[A-Z]/.test(rawPassword) ||
    !/\d/.test(rawPassword)
  ) {
    return "Password must include uppercase, lowercase, and a number.";
  }
  if (rawPassword !== rawConfirm) return "Passwords do not match.";
  return null;
}
