import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "crypto";

let db = null;
let useFirestore = false;

function initFirebase() {
  if (getApps().length > 0) {
    db = getFirestore();
    useFirestore = true;
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    console.warn("Firebase credentials not set. Using in-memory fallback.");
    useFirestore = false;
    return;
  }

  try {
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
    db = getFirestore();
    useFirestore = true;
  } catch (error) {
    console.error("Firebase init error:", error);
    useFirestore = false;
  }
}

initFirebase();

const SESSION_COOKIE = "aiv_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const PBKDF2_ITERATIONS = 210000;
const PASSWORD_KEY_LENGTH = 32;

function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production.");
  }
  return "dev-only-change-me-with-SESSION_SECRET-before-deploying";
}

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function base64Url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64Url(input) {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function createSessionToken(user) {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    sub: user.id, name: user.name, email: user.email,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  }));
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

function timingSafeEqStr(a, b) {
  // Compare base64url strings in a timing-safe way (both normalized to utf8 bytes)
  const ab = Buffer.from(a || "", "utf8");
  const bb = Buffer.from(b || "", "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifySessionToken(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const body = `${header}.${payload}`;
  const expected = sign(body);

  // signature/expected are base64url strings; compare strings (timing-safe)
  if (!timingSafeEqStr(signature, expected)) return null;

  try {
    const session = JSON.parse(fromBase64Url(payload));
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

function parseCookies(h = "") {
  return h.split(";").reduce((c, p) => {
    const [k, ...v] = p.trim().split("=");
    if (k) c[k] = decodeURIComponent(v.join("="));
    return c;
  }, {});
}

function sessionCookie(token) {
  const secure = process.env.VERCEL === "1";
  return [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${SESSION_MAX_AGE_SECONDS}`, secure ? "Secure" : ""].filter(Boolean).join("; ");
}

async function readUsers() {
  if (!useFirestore) return [];
  try {
    const snap = await db.collection("users").get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch (e) { console.error(e); return []; }
}

async function getRememberSession(token) {
  if (!useFirestore || !token) return null;
  try {
    const snap = await db.collection("rememberSessions").where("token", "==", token).limit(1).get();
    if (snap.empty) return null;
    const data = snap.docs[0].data();
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
      await snap.docs[0].ref.delete();
      return null;
    }
    return { user: { id: data.userId, name: data.name, email: data.email } };
  } catch (e) { console.error(e); return null; }
}

async function cleanExpiredSessions() {
  if (!useFirestore) return;
  try {
    const cutoff = Math.floor(Date.now() / 1000);
    const snap = await db.collection("rememberSessions").where("exp", "<", cutoff).get();
    const batch = db.batch();
    snap.forEach(doc => batch.delete(doc.ref));
    if (!snap.empty) await batch.commit();
  } catch (e) { console.error("Failed to clean sessions:", e); }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    await cleanExpiredSessions();
    const cookies = parseCookies(req.headers.cookie || "");
    const cookieSession = verifySessionToken(cookies[SESSION_COOKIE]);
    if (cookieSession) {
      return res.status(200).json({ authenticated: true, user: cookieSession });
    }
    const authHeader = req.headers.authorization?.replace("Bearer ", "");
    const rememberSession = authHeader && await getRememberSession(authHeader);
    if (rememberSession) {
      return res.status(200).json({ authenticated: true, user: rememberSession.user });
    }
    return res.status(200).json({ authenticated: false, user: null });
  } catch (e) { console.error(e); return res.status(500).json({ error: "Internal server error" }); }
}