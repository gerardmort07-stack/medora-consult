import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  getAuth,
  signInWithCustomToken,
  signOut,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset as firebaseConfirmPasswordReset,
} from "firebase/auth";
import api from "./api";

// This is the PUBLIC, client-side Firebase config (safe to expose in the
// browser — it identifies the project, it does not grant privileged
// access). It is used ONLY for the real-time Firestore listener on the
// doctor dashboard; all writes/mutations still go through the Express
// backend, never directly from the client.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Safe initialisation. This module is imported by AuthContext, i.e. before
// anything renders, so it must NEVER throw at import time — an exception
// here white-screens the whole app. If the VITE_FIREBASE_* variables were
// missing at build time, Firebase would throw (auth/invalid-api-key), so we
// guard for that and degrade gracefully instead.
const apps = getApps() || [];
let app = null;
try {
  if (apps.length > 0) {
    app = apps[0];
  } else if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    app = initializeApp(firebaseConfig);
  } else {
    console.error(
      "[firebaseClient] Missing VITE_FIREBASE_* env vars at build time — real-time features disabled."
    );
  }
} catch (err) {
  console.error("[firebaseClient] Firebase init failed:", err);
}

let _firestore = null;
let _auth = null;
try {
  if (app) {
    _firestore = getFirestore(app);
    _auth = getAuth(app);
  }
} catch (err) {
  console.error("[firebaseClient] Firebase service init failed:", err);
}

export const firestore = _firestore;
export const firebaseAuth = _auth;

/**
 * Signs the current user into the Firebase client SDK using a custom token
 * minted by our backend (see /api/auth/firebase-token). This lets Firestore
 * security rules evaluate request.auth.uid for real-time listeners, without
 * ever exposing Firebase credentials the client shouldn't have.
 */
export async function ensureFirebaseAuthSession() {
  if (!firebaseAuth) throw new Error("Firebase client is not configured.");
  if (firebaseAuth.currentUser) return firebaseAuth.currentUser;
  const { data } = await api.get("/auth/firebase-token");
  const credential = await signInWithCustomToken(firebaseAuth, data.customToken);
  return credential.user;
}

export async function clearFirebaseAuthSession() {
  try {
    if (firebaseAuth) await signOut(firebaseAuth);
  } catch (err) {
    // ignore — best-effort cleanup
  }
}

/**
 * Sends a Firebase-generated password reset email. Firebase handles link
 * generation and delivery entirely — no custom mail server needed. The
 * link brings the user back to our own /reset-password page (via
 * actionCodeSettings.url) with a `mode=resetPassword&oobCode=...` query
 * string that ResetPassword.jsx reads.
 */
export function requestPasswordReset(email) {
  if (!firebaseAuth) return Promise.reject(new Error("Firebase client is not configured."));
  return sendPasswordResetEmail(firebaseAuth, email, {
    url: `${window.location.origin}/reset-password`,
    handleCodeInApp: true,
  });
}

/**
 * Verifies a password-reset oobCode is valid and returns the associated
 * email address (so the reset page can show "Resetting password for...").
 */
export function checkPasswordResetCode(oobCode) {
  if (!firebaseAuth) return Promise.reject(new Error("Firebase client is not configured."));
  return verifyPasswordResetCode(firebaseAuth, oobCode);
}

/**
 * Completes the password reset given a valid oobCode and new password.
 */
export function confirmPasswordReset(oobCode, newPassword) {
  if (!firebaseAuth) return Promise.reject(new Error("Firebase client is not configured."));
  return firebaseConfirmPasswordReset(firebaseAuth, oobCode, newPassword);
}
