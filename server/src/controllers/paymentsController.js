const { db } = require("../config/firebaseAdmin");
const { verifyTransaction } = require("../config/paystack");
const { confirmAppointmentPayment } = require("./appointmentController");

/**
 * POST /api/payments/verify
 * Called immediately by the frontend's Paystack Inline `onSuccess` callback
 * (in addition to the Paystack webhook, which remains the authoritative
 * fallback for cases where the browser closes before this fires). This is
 * what makes payment confirmation feel instant instead of waiting on
 * webhook delivery latency.
 *
 * Body: { reference, appointmentId }
 */
async function verifyPayment(req, res) {
  const { reference, appointmentId } = req.body;

  if (!reference || !appointmentId) {
    return res.status(400).json({ success: false, message: "reference and appointmentId are both required." });
  }

  try {
    const appointmentSnap = await db.collection("appointments").doc(appointmentId).get();
    if (!appointmentSnap.exists) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }
    const appointment = appointmentSnap.data();

    if (appointment.patientId !== req.user.uid) {
      return res.status(403).json({ success: false, message: "This appointment does not belong to you." });
    }
    if (appointment.paymentReference !== reference) {
      return res.status(400).json({ success: false, message: "Payment reference does not match this appointment." });
    }

    // Already confirmed (e.g. the webhook beat this call to it) — return
    // the current state so the frontend still gets the PIN immediately.
    if (appointment.paymentStatus === "paid") {
      return res.json({ success: true, appointment });
    }

    const verification = await verifyTransaction(reference);
    if (verification.data.status !== "success") {
      return res.status(400).json({
        success: false,
        message: "Payment was not successful.",
        status: verification.data.status,
      });
    }

    const updatedAppointment = await confirmAppointmentPayment(reference);
    return res.json({ success: true, appointment: updatedAppointment });
  } catch (err) {
    console.error("[paymentsController.verifyPayment] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not verify payment. Please try again." });
  }
}

module.exports = { verifyPayment };
