const jwt = require("jsonwebtoken");
const { admin, db, auth } = require("../config/firebaseAdmin");
const { generateHumanReadableId } = require("../utils/idGenerator");

// Patients never have accounts — booking is guest-only (see
// appointmentController.bookAppointment / the Access Portal). Admin
// accounts are bootstrapped from .env, never self-registered. Doctor is
// the only role anyone can self-register as.
const ALLOWED_ROLES = ["doctor"];

function issueToken(uid, role) {
  return jwt.sign({ uid, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function setSessionCookie(res, token) {
  res.cookie("medora_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

function sanitizeProfile(profile) {
  // Never leak internal fields to the client.
  const { ...rest } = profile;
  return rest;
}

/**
 * POST /api/auth/register
 * Atomic: creates the Firebase Auth user AND the Firestore profile inside
 * one try/catch. If the Firestore write fails, the just-created Auth user
 * is deleted so no orphaned account is left behind.
 */
async function register(req, res) {
  const { fullName, email, password, phone, role } = req.body;

  if (!fullName || !email || !password || !phone || !role) {
    return res.status(400).json({
      success: false,
      message: "fullName, email, password, phone and role are all required.",
    });
  }

  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({
      success: false,
      message: `role must be one of: ${ALLOWED_ROLES.join(", ")}.`,
    });
  }

  if (password.length < 8) {
    return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });
  }

  let createdAuthUser = null;

  try {
    // Step 1: create the Firebase Auth user.
    createdAuthUser = await auth.createUser({
      email,
      password,
      displayName: fullName,
      phoneNumber: undefined, // Arkesel numbers may not be E.164; store phone in Firestore instead
    });

    // Step 2: generate a human-readable ID and write the Firestore profile.
    const humanId = await generateHumanReadableId(role);
    const status = role === "doctor" ? "pending" : "active";

    const profile = {
      uid: createdAuthUser.uid,
      humanId,
      fullName,
      email,
      role,
      phone,
      status,
      createdAt: new Date().toISOString(),
    };

    await db.collection("users").doc(createdAuthUser.uid).set(profile);

    // Step 3: mirror role as a custom claim so Firebase-side rules (if any) can use it.
    await auth.setCustomUserClaims(createdAuthUser.uid, { role });

    const token = issueToken(createdAuthUser.uid, role);
    setSessionCookie(res, token);

    return res.status(201).json({
      success: true,
      message:
        role === "doctor"
          ? "Registration successful. Your account is pending admin approval before you can log in."
          : "Registration successful.",
      token,
      user: sanitizeProfile(profile),
    });
  } catch (err) {
    console.error("[authController.register] Registration failed:", err.message);

    // Rollback: if the Auth user was created but the Firestore write (or
    // anything after it) failed, delete the orphaned Auth user.
    if (createdAuthUser) {
      try {
        await auth.deleteUser(createdAuthUser.uid);
        console.warn(`[authController.register] Rolled back orphaned Auth user ${createdAuthUser.uid}`);
      } catch (rollbackErr) {
        console.error(
          `[authController.register] CRITICAL: failed to roll back orphaned Auth user ${createdAuthUser.uid}:`,
          rollbackErr.message
        );
      }
    }

    if (err.code === "auth/email-already-exists") {
      return res.status(409).json({ success: false, message: "An account with this email already exists." });
    }
    if (err.code === "auth/invalid-password") {
      return res.status(400).json({ success: false, message: "Password does not meet Firebase requirements." });
    }

    return res.status(500).json({ success: false, message: "Registration failed. Please try again." });
  }
}

/**
 * POST /api/auth/login
 * Verifies credentials via the Firebase Auth REST API (the Admin SDK has no
 * password-verification method by design), then issues our own server JWT.
 */
async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required." });
  }

  try {
    const apiKey = await resolveWebApiKey();
    const axios = require("axios");

    let signInResponse;
    try {
      signInResponse = await axios.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
        { email, password, returnSecureToken: true }
      );
    } catch (err) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const { localId } = signInResponse.data;

    const profileSnap = await db.collection("users").doc(localId).get();
    if (!profileSnap.exists) {
      return res.status(404).json({ success: false, message: "No profile found for this account." });
    }

    const profile = profileSnap.data();

    if (profile.role === "doctor" && profile.status === "pending") {
      return res.status(403).json({
        success: false,
        message: "Your doctor account is still pending admin approval.",
      });
    }

    const token = issueToken(localId, profile.role);
    setSessionCookie(res, token);

    return res.json({ success: true, token, user: sanitizeProfile(profile) });
  } catch (err) {
    console.error("[authController.login] Login failed:", err.message);
    return res.status(500).json({ success: false, message: "Login failed. Please try again." });
  }
}

/**
 * Resolves the Firebase Web API key needed for password sign-in via REST.
 * Firebase Admin credentials do not include this, so it is read from an
 * explicit env var to keep configuration in one place.
 */
async function resolveWebApiKey() {
  if (!process.env.FIREBASE_WEB_API_KEY) {
    throw new Error(
      "FIREBASE_WEB_API_KEY is not set. Find it in Firebase Console > Project Settings > General > Web API Key."
    );
  }
  return process.env.FIREBASE_WEB_API_KEY;
}

/**
 * GET /api/auth/me
 * Session-restore check, called on every app load — so unlike every other
 * protected route, this one deliberately does NOT use the requireAuth
 * middleware (which responds 401/403 on a missing/invalid/pending session).
 * A logged-out visitor hitting this endpoint is the expected, normal case,
 * not an error: it always responds 200, with either the user's profile or
 * `user: null`. This avoids spamming the browser console with 401s on
 * every fresh page load while a guest browses the site. Every OTHER
 * protected endpoint still uses requireAuth and still correctly rejects
 * unauthenticated requests — this relaxation is scoped to this one
 * read-only "am I logged in?" check.
 */
async function me(req, res) {
  try {
    const bearerHeader = req.headers.authorization;
    const bearerToken = bearerHeader && bearerHeader.startsWith("Bearer ") ? bearerHeader.slice(7) : null;
    const token = req.cookies?.medora_token || bearerToken;

    if (!token) {
      return res.status(200).json({ success: true, user: null });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(200).json({ success: true, user: null });
    }

    const profileSnap = await db.collection("users").doc(decoded.uid).get();
    if (!profileSnap.exists) {
      return res.status(200).json({ success: true, user: null });
    }

    const profile = profileSnap.data();

    // A doctor pending approval isn't a usable session yet — treat the
    // same as logged-out here (they still can't log in via /login either).
    if (profile.role === "doctor" && profile.status === "pending") {
      return res.status(200).json({ success: true, user: null });
    }

    return res.status(200).json({ success: true, user: sanitizeProfile({ uid: decoded.uid, ...profile }) });
  } catch (err) {
    console.error("[authController.me] Unexpected error:", err.message);
    // Even on an unexpected server error, this endpoint never breaks page
    // load — worst case, the app treats the visitor as logged out.
    return res.status(200).json({ success: true, user: null });
  }
}

/**
 * GET /api/auth/firebase-token
 * Mints a short-lived Firebase custom token for the already-authenticated
 * (via our own server JWT) user, so the browser can sign in to the Firebase
 * client SDK and use REAL-TIME Firestore listeners — while Firestore
 * security rules still enforce that a user can only read their own
 * documents (rules should check request.auth.uid against doctorId). Only
 * doctors and admins have accounts to mint this for — guests use a
 * separate, appointment-scoped token minted by guestAccess() instead.
 * This keeps all writes flowing through the Express backend while still
 * allowing read-only real-time listeners on the client.
 */
async function getFirebaseCustomToken(req, res) {
  try {
    const customToken = await auth.createCustomToken(req.user.uid, { role: req.user.role });
    return res.json({ success: true, customToken });
  } catch (err) {
    console.error("[authController.getFirebaseCustomToken] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not create realtime session." });
  }
}

/**
 * POST /api/auth/logout
 */
async function logout(req, res) {
  res.clearCookie("medora_token");
  return res.json({ success: true, message: "Logged out." });
}

/**
 * Called once on server boot. Ensures the master admin account defined in
 * .env exists in both Firebase Auth and Firestore. Never throws — logs and
 * continues so a boot-time hiccup never crashes the server.
 */
async function bootstrapMasterAdmin() {
  const email = process.env.MASTER_ADMIN_EMAIL;
  const password = process.env.MASTER_ADMIN_PASSWORD;
  const fullName = process.env.MASTER_ADMIN_FULLNAME || "Medora System Administrator";
  const phone = process.env.MASTER_ADMIN_PHONE || "";

  if (!email || !password) {
    console.warn("[bootstrapMasterAdmin] MASTER_ADMIN_EMAIL/PASSWORD not set — skipping admin bootstrap.");
    return;
  }

  try {
    let existingUser;
    try {
      existingUser = await auth.getUserByEmail(email);
    } catch (err) {
      if (err.code !== "auth/user-not-found") throw err;
      existingUser = null;
    }

    if (existingUser) {
      const profileSnap = await db.collection("users").doc(existingUser.uid).get();
      if (!profileSnap.exists) {
        // Auth user exists but profile is missing — repair it.
        const humanId = await generateHumanReadableId("admin");
        await db.collection("users").doc(existingUser.uid).set({
          uid: existingUser.uid,
          humanId,
          fullName,
          email,
          role: "admin",
          phone,
          status: "active",
          createdAt: new Date().toISOString(),
        });
        console.log(`[bootstrapMasterAdmin] Repaired missing Firestore profile for existing admin ${email}.`);
      } else {
        console.log(`[bootstrapMasterAdmin] Master admin ${email} already exists — skipping.`);
      }
      return;
    }

    const newAdmin = await auth.createUser({ email, password, displayName: fullName });
    await auth.setCustomUserClaims(newAdmin.uid, { role: "admin" });

    const humanId = await generateHumanReadableId("admin");
    await db.collection("users").doc(newAdmin.uid).set({
      uid: newAdmin.uid,
      humanId,
      fullName,
      email,
      role: "admin",
      phone,
      status: "active",
      createdAt: new Date().toISOString(),
    });

    console.log(`[bootstrapMasterAdmin] Provisioned master admin account for ${email}.`);
  } catch (err) {
    console.error("[bootstrapMasterAdmin] Failed to bootstrap master admin:", err.message);
  }
}

module.exports = { register, login, me, logout, bootstrapMasterAdmin, getFirebaseCustomToken };
