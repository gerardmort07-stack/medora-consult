const { db } = require("../config/firebaseAdmin");

const PREFIX_BY_ROLE = {
  doctor: "DOC",
  patient: "PAT",
  admin: "ADM",
};

/**
 * Atomically generates the next sequential human-readable ID for a role,
 * e.g. "DOC-2026-001". Uses a Firestore transaction on a counters
 * document so concurrent registrations never collide.
 * @param {"doctor"|"patient"|"admin"} role
 */
async function generateHumanReadableId(role) {
  const prefix = PREFIX_BY_ROLE[role] || "USR";
  const year = new Date().getFullYear();
  const counterRef = db.collection("counters").doc(`${role}-${year}`);

  const nextNumber = await db.runTransaction(async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    const current = counterSnap.exists ? counterSnap.data().value || 0 : 0;
    const next = current + 1;
    transaction.set(counterRef, { value: next, updatedAt: new Date().toISOString() }, { merge: true });
    return next;
  });

  const padded = String(nextNumber).padStart(3, "0");
  return `${prefix}-${year}-${padded}`;
}

/**
 * Generates a human-readable appointment ID, e.g. "APT-2026-001".
 */
async function generateAppointmentId() {
  const year = new Date().getFullYear();
  const counterRef = db.collection("counters").doc(`appointment-${year}`);

  const nextNumber = await db.runTransaction(async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    const current = counterSnap.exists ? counterSnap.data().value || 0 : 0;
    const next = current + 1;
    transaction.set(counterRef, { value: next, updatedAt: new Date().toISOString() }, { merge: true });
    return next;
  });

  const padded = String(nextNumber).padStart(3, "0");
  return `APT-${year}-${padded}`;
}

module.exports = { generateHumanReadableId, generateAppointmentId };
