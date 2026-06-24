import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "crypto";

let db = null;
let useFirestore = false;
let adminApp = null;
let initError = null;

function initFirebase() {
  if (adminApp) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId) {
    initError = new Error("FIREBASE_PROJECT_ID is not set");
    console.error(initError.message);
    return;
  }

  try {
    if (clientEmail && privateKey) {
      adminApp = initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
      });
    } else {
      initError = new Error(
        "Firebase Admin requires FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY " +
        "environment variables to verify ID tokens. Project-only init cannot verify tokens."
      );
      console.error(initError.message);
      return;
    }
    try {
      db = getFirestore(adminApp);
      useFirestore = true;
    } catch (e) {
      console.warn("Firestore unavailable:", e);
    }
  } catch (e) {
    initError = e;
    console.error("Firebase Admin init error:", e);
  }
}
initFirebase();

const SESSION_COOKIE = "aiv_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production.");
  }
  return "dev-only-change-me-with-SESSION_SECRET-before-deploying";
}
function sign(v) {
  return crypto.createHmac("sha256", sessionSecret()).update(v).digest("base64url");
}
function b64u(i) {
  return Buffer.from(i).toString("base64").replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}
function createSessionToken(u) {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64u(JSON.stringify({
    sub: u.id, name: u.name, email: u.email,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  }));
  return `${h}.${p}.${sign(`${h}.${p}`)}`;
}
function sessionCookie(token) {
  const secure = process.env.VERCEL === "1";
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly", "SameSite=Lax", "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

async function readUsers() {
  if (!useFirestore) return [];
  try {
    const snap = await db.collection("users").get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch (e) { console.error(e); return []; }
}

async function writeUsers(users) { /* no-op in serverless — handled by Firestore */ }
function ensureUserStore() { /* no-op */ }

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: "Missing idToken" });
    }

    if (initError) {
      console.error("Firebase Admin not initialized:", initError.message);
      return res.status(500).json({ error: "Authentication service not configured on server." });
    }

    if (!adminApp) {
      return res.status(500).json({ error: "Firebase Admin not initialized. Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY." });
    }

    let decoded;
    try {
      decoded = await getAuth(adminApp).verifyIdToken(idToken);
    } catch (verifyError) {
      console.error("Token verification failed:", verifyError.message);
      return res.status(401).json({ error: "Invalid token" });
    }

    const { uid, email, name, picture } = decoded;
    const cleanEmail = (email || "").toLowerCase().trim();
    const displayName = name || cleanEmail.split("@")[0] || "Learner";

    let user = null;
    const allUsers = await readUsers();
    user = allUsers.find(u => u.firebaseUid === uid) || allUsers.find(u => u.email === cleanEmail);

    if (user) {
      user.name = displayName;
      user.avatar = picture || user.avatar;
      user.lastLogin = new Date().toISOString();
      if (!user.firebaseUid) user.firebaseUid = uid;
      if (!user.authProvider) user.authProvider = "google";
      if (useFirestore) {
        await db.collection("users").doc(user.id).update({
          name: displayName,
          avatar: picture || null,
          lastLogin: new Date().toISOString(),
          firebaseUid: uid,
          authProvider: "google",
        });
      }
    } else {
      const newUser = {
        id: uid,
        name: displayName,
        email: cleanEmail,
        avatar: picture || null,
        firebaseUid: uid,
        authProvider: "google",
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };
      if (useFirestore) {
        const docRef = await db.collection("users").add(newUser);
        newUser.id = docRef.id;
      }
      user = newUser;
    }

    const token = createSessionToken(user);
    const cookie = sessionCookie(token);

    return res.status(200)
      .setHeader("Set-Cookie", cookie)
      .json({
        authenticated: true,
        user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar },
      });

  } catch (error) {
    console.error("Google auth error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
