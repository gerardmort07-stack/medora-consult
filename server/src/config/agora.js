const { RtcTokenBuilder, RtcRole } = require("agora-access-token");

const APP_ID = process.env.AGORA_APP_ID || "";
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || "";
const TOKEN_EXPIRY_SECONDS = parseInt(process.env.AGORA_TOKEN_EXPIRY_SECONDS || "3600", 10);

if (!APP_ID || !APP_CERTIFICATE) {
  console.warn(
    "[agora] AGORA_APP_ID / AGORA_APP_CERTIFICATE not set. Video token " +
      "generation will fail until they are configured in .env."
  );
}

/**
 * Generates a unique, URL-safe Agora channel name for an appointment.
 * @param {string} appointmentId
 */
function buildChannelName(appointmentId) {
  return `medora-${appointmentId}`.replace(/[^a-zA-Z0-9_-]/g, "");
}

/**
 * Generates a short-lived Agora RTC token for a given channel + uid.
 * @param {string} channelName
 * @param {number} uid - numeric UID (0 lets Agora assign one)
 * @param {"publisher"|"subscriber"} role
 */
function generateRtcToken(channelName, uid = 0, role = "publisher") {
  if (!APP_ID || !APP_CERTIFICATE) {
    throw new Error("Agora is not configured (missing AGORA_APP_ID or AGORA_APP_CERTIFICATE).");
  }

  const rtcRole = role === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + TOKEN_EXPIRY_SECONDS;

  const token = RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERTIFICATE,
    channelName,
    uid,
    rtcRole,
    privilegeExpiredTs
  );

  return { token, appId: APP_ID, channelName, uid, expiresAt: privilegeExpiredTs };
}

module.exports = { buildChannelName, generateRtcToken, APP_ID };
