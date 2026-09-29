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

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const firestore = getFirestore(app);
export const firebaseAuth = getAuth(app);

/**
 * Signs the current user into the Firebase client SDK using a custom token
 * minted by our backend (see /api/auth/firebase-token). This lets Firestore
 * security rules evaluate request.auth.uid for real-time listeners, without
 * ever exposing Firebase credentials the client shouldn't have.
 */
export async function ensureFirebaseAuthSession() {
  if (firebaseAuth.currentUser) return firebaseAuth.currentUser;
  const { data } = await api.get("/auth/firebase-token");
  const credential = await signInWithCustomToken(firebaseAuth, data.customToken);
  return credential.user;
}

export async function clearFirebaseAuthSession() {
  try {
    await signOut(firebaseAuth);
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
  return verifyPasswordResetCode(firebaseAuth, oobCode);
}

/**
 * Completes the password reset given a valid oobCode and new password.
 */
export function confirmPasswordReset(oobCode, newPassword) {
  return firebaseConfirmPasswordReset(firebaseAuth, oobCode, newPassword);
}
