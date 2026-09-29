const crypto = require("crypto");

/**
 * Generates a secure 6-digit numeric consultation access PIN, e.g. "849201".
 * Uses crypto.randomInt (uniformly distributed, cryptographically strong)
 * rather than Math.random, since this PIN gates access to a private video
 * consultation.
 */
function generateConsultationPin() {
  return crypto.randomInt(100000, 1000000).toString();
}

module.exports = { generateConsultationPin };
