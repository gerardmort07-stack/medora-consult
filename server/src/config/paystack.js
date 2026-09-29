const axios = require("axios");

const PAYSTACK_BASE_URL = "https://api.paystack.co";

if (!process.env.PAYSTACK_SECRET_KEY) {
  console.warn(
    "[paystack] PAYSTACK_SECRET_KEY is not set. Payment initialization and " +
      "verification calls will fail until it is configured in .env."
  );
}

const paystackClient = axios.create({
  baseURL: PAYSTACK_BASE_URL,
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY || ""}`,
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

/**
 * Initializes a Paystack transaction for a given appointment.
 *
 * callbackUrl is only ever exercised by the FALLBACK full-page-redirect
 * flow (used when the Paystack Inline popup script fails to load in the
 * browser — see launchPaystackInline() in PatientDashboard.jsx). The
 * primary flow never redirects at all: Inline's own `callback` fires
 * client-side and hits POST /api/payments/verify directly. Without this,
 * a patient who fell back to the redirect flow would land on Paystack's
 * own post-payment page with no way back into the app.
 * @param {{ email: string, amountKobo: number, reference: string, metadata: object, callbackUrl?: string }} params
 */
async function initializeTransaction({ email, amountKobo, reference, metadata, callbackUrl }) {
  const response = await paystackClient.post("/transaction/initialize", {
    email,
    amount: amountKobo,
    reference,
    metadata,
    currency: "GHS",
    ...(callbackUrl ? { callback_url: callbackUrl } : {}),
  });
  return response.data;
}

/**
 * Verifies a Paystack transaction by its reference.
 * @param {string} reference
 */
async function verifyTransaction(reference) {
  const response = await paystackClient.get(`/transaction/verify/${encodeURIComponent(reference)}`);
  return response.data;
}

module.exports = { paystackClient, initializeTransaction, verifyTransaction };
