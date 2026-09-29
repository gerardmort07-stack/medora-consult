const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USER, EMAIL_SMTP_PASS } = process.env;

  if (!EMAIL_SMTP_HOST || !EMAIL_SMTP_USER || !EMAIL_SMTP_PASS) {
    return null; // not configured — callers fall back to a dry-run log
  }

  transporter = nodemailer.createTransport({
    host: EMAIL_SMTP_HOST,
    port: parseInt(EMAIL_SMTP_PORT || "587", 10),
    secure: process.env.EMAIL_SMTP_SECURE === "true",
    auth: { user: EMAIL_SMTP_USER, pass: EMAIL_SMTP_PASS },
  });

  return transporter;
}

function buildConfirmationEmailHtml({ patientName, humanId, serviceName, pin }) {
  return `
  <div style="font-family: 'Inter', Arial, sans-serif; background:#f8fafc; padding:32px;">
    <div style="max-width:480px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0;">
      <div style="background:#0F172A; padding:24px; text-align:center;">
        <h1 style="color:#ffffff; margin:0; font-size:20px;">Medora Consult</h1>
      </div>
      <div style="padding:28px;">
        <p style="color:#0F172A; font-size:15px;">Hi ${patientName},</p>
        <p style="color:#334155; font-size:14px; line-height:1.6;">
          Your <strong>${serviceName}</strong> booking (<strong>${humanId}</strong>) is confirmed and
          payment has been received. A doctor will accept your request shortly.
        </p>
        <p style="color:#334155; font-size:14px; line-height:1.6;">
          Keep the access code below safe — you'll need it to unlock your video consultation once a
          doctor accepts your request.
        </p>
        <div style="margin:24px 0; text-align:center;">
          <span style="display:inline-block; background:#0D9488; color:#ffffff; font-size:28px; font-weight:700; letter-spacing:6px; padding:14px 28px; border-radius:10px;">
            ${pin}
          </span>
        </div>
        <p style="color:#94a3b8; font-size:12px; line-height:1.6;">
          Medical Disclaimer: Medora Consult provides online medical consultations and advisory
          services only. It is not a replacement for physical hospital visits or emergency medical
          care. In case of a medical emergency, please visit the nearest hospital immediately.
        </p>
      </div>
    </div>
  </div>`;
}

/**
 * Sends the booking confirmation email containing the consultation access
 * PIN. Never throws — a failed email must never block payment confirmation.
 * Falls back to a dry-run console log if SMTP is not configured.
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function sendConfirmationEmail(to, { patientName, humanId, serviceName, pin }) {
  const transport = getTransporter();

  if (!transport) {
    console.log(`[email] (DRY RUN — SMTP not configured) Would email ${to} PIN ${pin} for ${humanId}`);
    return { success: false, error: "SMTP not configured" };
  }

  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM || '"Medora Consult" <no-reply@medoraconsult.com>',
      to,
      subject: `Your Medora Consult access code — ${humanId}`,
      html: buildConfirmationEmailHtml({ patientName, humanId, serviceName, pin }),
    });
    return { success: true };
  } catch (err) {
    console.error("[email] Failed to send confirmation email:", err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendConfirmationEmail };
