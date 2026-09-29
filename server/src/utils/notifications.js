const { sendSms } = require("../config/arkesel");
const { sendConfirmationEmail } = require("../config/email");

/**
 * Higher-level notification dispatch for the guest booking workflow. The
 * low-level transports (Arkesel SMS, Nodemailer/SMTP) live in
 * server/src/config/ — this module composes the actual message content and
 * sends across both channels together, independently, so one channel
 * failing never blocks or fails the other. Every function here is
 * best-effort: none of them ever throw, so a notification failure never
 * blocks the request that triggered it (payment authorization, doctor
 * broadcast, etc.).
 */

const ACCESS_PORTAL_URL = process.env.PUBLIC_ACCESS_URL || "http://localhost:5173/access";

/**
 * Sent the moment an admin authorizes (manually verifies) a guest's MoMo
 * payment. This is the patient's definitive, durable confirmation — even
 * though the PIN was already shown on-screen at booking time, the patient
 * may not have saved it, and this message is also proof their payment was
 * actually accepted.
 */
async function sendAccessAuthorizedNotification({ patientName, patientPhone, patientEmail, consultationPin }) {
  const message = `Hello ${patientName}, your payment for Medora Consult has been authorized! Your Access PIN is ${consultationPin}. Access your doctor room at ${ACCESS_PORTAL_URL}.`;

  const [smsResult, emailResult] = await Promise.allSettled([
    sendSms(patientPhone, message),
    sendConfirmationEmail(patientEmail, {
      patientName,
      humanId: "your Medora Consult booking",
      serviceName: "your consultation",
      pin: consultationPin,
    }),
  ]);

  if (smsResult.status === "rejected" || smsResult.value?.success === false) {
    console.warn(`[notifications] SMS to ${patientPhone} did not send.`);
  }
  if (emailResult.status === "rejected" || emailResult.value?.success === false) {
    console.warn(`[notifications] Email to ${patientEmail} did not send.`);
  }
}

/**
 * Best-effort broadcast to every active doctor when a booking becomes
 * available to claim (i.e. right after an admin authorizes payment).
 */
async function sendDoctorBroadcast(doctors, { humanId, serviceName }) {
  if (!doctors.length) {
    console.warn("[notifications] No active doctors to notify.");
    return;
  }

  const message = `Medora Consult: New ${serviceName} request (${humanId}) is available. Open your dashboard to accept it.`;
  const results = await Promise.allSettled(doctors.map((phone) => sendSms(phone, message)));

  const failures = results.filter((r) => r.status === "rejected" || r.value?.success === false).length;
  if (failures > 0) {
    console.warn(`[notifications] ${failures}/${results.length} doctor SMS notifications did not send.`);
  }
}

module.exports = { sendAccessAuthorizedNotification, sendDoctorBroadcast };
