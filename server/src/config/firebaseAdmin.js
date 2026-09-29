const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

/**
 * Dual-method Firebase Admin initialization.
 *   Method A: a real service-account JSON file at server/firebase-service-account.json
 *   Method B: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY env vars
 * Method A is tried first; if the file is missing OR is still the unfilled
 * template (project_id === "your-firebase-project-id"), we fall back to B.
 */
function loadServiceAccountFromFile() {
  const filePath = path.join(__dirname, "..", "..", "firebase-service-account.json");

  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);

    const isTemplate =
      !parsed.project_id ||
      parsed.project_id === "your-firebase-project-id" ||
      !parsed.private_key ||
      parsed.private_key.includes("YOUR_KEY_HERE");

    if (isTemplate) return null;

    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    };
  } catch (err) {
    console.warn(
      "[firebaseAdmin] Found firebase-service-account.json but failed to parse it — falling back to env vars.",
      err.message
    );
    return null;
  }
}

function loadServiceAccountFromEnv() {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    return null;
  }

  return {
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    // .env files store literal "\n" — convert to real newlines for the PEM key.
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
}

const MISCONFIGURED_MESSAGE =
  "Firebase is not configured. Provide a real server/firebase-service-account.json " +
  "OR set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in your " +
  ".env file, then restart the server.";

/**
 * Initializes the Firebase Admin SDK exactly once, on first real use — NOT
 * at module require() time. This is deliberate: every controller in this
 * app requires this file, so eagerly throwing here would crash the entire
 * process before Express even finishes registering routes, which makes the
 * failure harder to diagnose than it needs to be.
 *
 * This is intentionally NOT a silent fallback. If credentials are missing,
 * every attempt to use `db` or `auth` still throws a clear, actionable
 * error — every single time, at the exact call site that needed the
 * database. That is the correct behavior for a platform that stores
 * medical bookings and confirms real payments: a misconfigured deployment
 * must fail loudly, never silently accept a booking or payment into a
 * database connection that was never actually established.
 */
function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin;
  }

  const credentials = loadServiceAccountFromFile() || loadServiceAccountFromEnv();

  if (!credentials) {
    throw new Error(`[firebaseAdmin] ${MISCONFIGURED_MESSAGE}`);
  }

  admin.initializeApp({
    credential: admin.credential.cert(credentials),
  });

  console.log(
    `[firebaseAdmin] Initialized for project "${credentials.projectId}" via ` +
      `${loadServiceAccountFromFile() ? "service account file" : "environment variables"}.`
  );

  return admin;
}

/**
 * True once Firebase has been configured AND successfully initialized.
 * Safe to call anytime, including before first use — never throws. Useful
 * for a health-check endpoint to report a degraded (not crashed) status.
 */
function isFirebaseConfigured() {
  if (admin.apps.length > 0) return true;
  return Boolean(loadServiceAccountFromFile() || loadServiceAccountFromEnv());
}

/**
 * Wraps a Firestore/Auth getter in a Proxy so that requiring this module
 * never throws, but touching ANY property of `db` or `auth` — including
 * deep in a chain like db.collection('x').doc('y').get() — triggers
 * initialization first and throws immediately if it fails. This preserves
 * "fail loudly, never fail silently" while letting the rest of the app
 * (routes, unrelated middleware, /api/health) load normally.
 */
function lazy(getInstance) {
  let cached;
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (!cached) {
          initializeFirebaseAdmin();
          cached = getInstance();
        }
        const value = cached[prop];
        return typeof value === "function" ? value.bind(cached) : value;
      },
    }
  );
}

const db = lazy(() => admin.firestore());
const auth = lazy(() => admin.auth());

module.exports = { admin, db, auth, isFirebaseConfigured };
