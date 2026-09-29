const axios = require("axios");

const ARKESEL_BASE_URL = "https://sms.arkesel.com/api/v2/sms/send";

if (!process.env.ARKESEL_API_KEY) {
  console.warn(
    "[arkesel] ARKESEL_API_KEY is not set. SMS notifications will be logged " +
      "but not actually sent until it is configured in .env."
  );
}

/**
 * Sends an SMS via the Arkesel API. Never throws — a failed SMS should
 * never block or fail an appointment booking. Errors are logged and
 * swallowed so the booking flow always completes.
 * @param {string} recipientPhone - E.164 or local format, e.g. "+233241234567"
 * @param {string} message
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function sendSms(recipientPhone, message) {
  if (!process.env.ARKESEL_API_KEY) {
    console.log(`[arkesel] (DRY RUN — no API key) Would send to ${recipientPhone}: ${message}`);
    return { success: false, error: "ARKESEL_API_KEY not configured" };
  }

  try {
    const response = await axios.post(
      ARKESEL_BASE_URL,
      {
        sender: process.env.ARKESEL_SENDER_ID || "Medora",
        message,
        recipients: [recipientPhone],
      },
      {
        headers: {
          "api-key": process.env.ARKESEL_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    if (response.data && (response.data.status === "success" || response.data.code === "ok")) {
      return { success: true };
    }

    console.warn("[arkesel] Unexpected response:", response.data);
    return { success: false, error: "Unexpected response from Arkesel" };
  } catch (err) {
    console.error("[arkesel] Failed to send SMS notification:", err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendSms };
