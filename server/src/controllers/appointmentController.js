const { admin, db } = require("../config/firebaseAdmin");
const { generateAppointmentId } = require("../utils/idGenerator");
const { generateConsultationPin } = require("../utils/pinGenerator");
const { sendAccessAuthorizedNotification, sendDoctorBroadcast } = require("../utils/notifications");
const { buildChannelName, generateRtcToken } = require("../config/agora");
const { signGuestToken } = require("../middleware/guestAuth");

const MAX_PIN_ATTEMPTS = 5;

/**
 * Guest-booking appointment lifecycle (no patient account exists at any
 * point — patientId/patientName/patientPhone/patientEmail are plain
 * strings supplied on the booking form, not tied to Firebase Auth):
 *
 *   pending_payment_verification -> awaiting_doctor_claim -> in_session -> completed
 *                                                                       \-> cancelled
 *
 * - pending_payment_verification: booking created, MoMo instructions shown,
 *   PIN generated immediately. Nothing is visible to doctors yet.
 * - awaiting_doctor_claim: an admin has manually verified the MoMo transfer
 *   and clicked "Authorize Payment" — this is the broadcast/claim stage.
 * - in_session: a doctor has claimed it (atomic transaction, first to
 *   accept wins) and the video room is open.
 *
 * The consultationPin is the patient's ONLY credential — there is no
 * login. It's generated at booking time (not payment time, since payment
 * is manual and may take a while) and is used, together with the phone
 * number, at POST /api/appointments/access to mint a short-lived
 * appointment-scoped guest token (see middleware/guestAuth.js). Unlike a
 * one-time video-room gate, this PIN is a RECURRING credential — the
 * guest has no session/cookie, so they re-enter it any time they return
 * to the Access Portal.
 */

/**
 * POST /api/appointments (PUBLIC — no account, no login)
 * Guest booking. Collects patient details directly on the form and
 * generates the access PIN immediately so it can be shown on the MoMo
 * instructions screen right away.
 */
async function bookAppointment(req, res) {
  const { serviceId, consultationType, scheduledFor, patientName, patientPhone, patientEmail, chiefComplaint } =
    req.body;

  if (!serviceId || !patientName || !patientPhone || !patientEmail) {
    return res.status(400).json({
      success: false,
      message: "serviceId, patientName, patientPhone and patientEmail are all required.",
    });
  }
  if (!["immediate", "scheduled"].includes(consultationType)) {
    return res.status(400).json({ success: false, message: 'consultationType must be "immediate" or "scheduled".' });
  }
  if (consultationType === "scheduled" && !scheduledFor) {
    return res.status(400).json({ success: false, message: "scheduledFor is required for a scheduled consultation." });
  }

  try {
    const serviceSnap = await db.collection("services").doc(serviceId).get();
    if (!serviceSnap.exists || !serviceSnap.data().isActive) {
      return res.status(404).json({ success: false, message: "This service is not currently available." });
    }
    const service = serviceSnap.data();

    const appointmentHumanId = await generateAppointmentId();
    const appointmentRef = db.collection("appointments").doc();
    const consultationPin = generateConsultationPin();

    const appointmentData = {
      id: appointmentRef.id,
      humanId: appointmentHumanId,
      patientName: patientName.trim(),
      patientPhone: patientPhone.trim(),
      patientEmail: patientEmail.trim(),
      serviceId: service.id,
      serviceName: service.name,
      priceKobo: service.priceKobo,
      consultationType,
      scheduledFor: consultationType === "scheduled" ? scheduledFor : null,
      chiefComplaint: chiefComplaint || "",
      doctorId: null,
      doctorName: null,
      passedBy: [],
      status: "pending_payment_verification", // -> awaiting_doctor_claim -> in_session -> completed | cancelled
      paymentMethod: "momo",
      paymentStatus: "unpaid",
      consultationPin,
      pinStatus: "active", // active -> locked (after MAX_PIN_ATTEMPTS failed access attempts)
      pinFailedAttempts: 0,
      channelName: null,
      rating: null,
      feedback: null,
      requestedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    await appointmentRef.set(appointmentData);

    return res.status(201).json({
      success: true,
      message: "Booking received. Follow the MoMo instructions to complete payment.",
      appointment: appointmentData,
      momo: {
        number: process.env.MOMO_NUMBER || "055-000-0000",
        name: process.env.MOMO_NAME || "Medora Consult",
        amountGhs: service.priceKobo / 100,
        reference: patientPhone.trim(),
      },
    });
  } catch (err) {
    console.error("[bookAppointment] Failed to create booking:", err.message);
    return res.status(500).json({ success: false, message: "Failed to create booking. Please try again." });
  }
}

/**
 * POST /api/appointments/:id/authorize-payment (admin only)
 * The manual MoMo verification step: the admin has checked their phone for
 * the incoming MoMo SMS, confirmed the transfer, and authorizes it here.
 * Moves the booking into the doctor broadcast/claim pool and notifies both
 * the patient (PIN + access link) and every active doctor.
 */
async function authorizePayment(req, res) {
  const { id } = req.params;

  try {
    const ref = db.collection("appointments").doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }
    const appointment = doc.data();

    if (appointment.status !== "pending_payment_verification") {
      return res.status(409).json({ success: false, message: "This booking is not awaiting payment verification." });
    }

    const channelName = buildChannelName(appointment.id);
    const updates = {
      paymentStatus: "paid",
      status: "awaiting_doctor_claim",
      channelName,
      authorizedBy: req.user.uid,
      authorizedAt: new Date().toISOString(),
    };

    await ref.update(updates);
    const updatedAppointment = { ...appointment, ...updates };

    // Best-effort notifications — never block the response to the admin.
    sendAccessAuthorizedNotification({
      patientName: updatedAppointment.patientName,
      patientPhone: updatedAppointment.patientPhone,
      patientEmail: updatedAppointment.patientEmail,
      consultationPin: updatedAppointment.consultationPin,
    }).catch((err) => console.error("[authorizePayment] Patient notification failed unexpectedly:", err.message));

    db.collection("users")
      .where("role", "==", "doctor")
      .where("status", "==", "active")
      .get()
      .then((snap) => sendDoctorBroadcast(snap.docs.map((d) => d.data().phone), updatedAppointment))
      .catch((err) => console.error("[authorizePayment] Doctor broadcast failed unexpectedly:", err.message));

    return res.json({ success: true, message: "Payment authorized.", appointment: updatedAppointment });
  } catch (err) {
    console.error("[authorizePayment] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not authorize payment." });
  }
}

/**
 * POST /api/appointments/access (PUBLIC)
 * The patient's only "login": phone number + 6-digit PIN. On success,
 * issues a short-lived guest token scoped to that one appointment. Looks
 * up by PIN first (effectively unique given the 900,000-value space and
 * this app's scale) then confirms the phone matches in application code,
 * rather than a compound Firestore query — this way no composite index
 * needs to be provisioned for the app to work out of the box.
 */
async function guestAccess(req, res) {
  const { phone, pin } = req.body;

  if (!phone || !pin) {
    return res.status(400).json({ success: false, message: "Phone number and PIN are both required." });
  }

  try {
    const candidatesSnap = await db.collection("appointments").where("consultationPin", "==", pin.trim()).limit(5).get();
    const normalizedPhone = phone.trim().replace(/\s+/g, "");
    const match = candidatesSnap.docs.find(
      (d) => d.data().patientPhone.replace(/\s+/g, "") === normalizedPhone
    );

    if (!match) {
      return res.status(401).json({ success: false, message: "Phone number and PIN do not match any booking." });
    }

    const appointment = match.data();

    if (appointment.pinStatus === "locked") {
      return res.status(403).json({
        success: false,
        message: "This booking is locked after too many attempts. Please contact support.",
      });
    }

    const guestToken = signGuestToken(appointment.id);
    await match.ref.update({ lastAccessedAt: new Date().toISOString() });

    return res.json({ success: true, guestToken, appointment });
  } catch (err) {
    console.error("[guestAccess] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not verify your access details." });
  }
}

/**
 * POST /api/appointments/:id/accept ("Claim Consultation", doctor only)
 * Atomically claims an authorized, unassigned booking and opens it for
 * video immediately (status goes straight to in_session — claiming IS
 * launching, per the workflow). Uses a Firestore transaction so
 * simultaneous claims from two doctors can't both succeed.
 */
async function acceptAppointment(req, res) {
  const { id } = req.params;
  const doctor = req.user;

  try {
    const ref = db.collection("appointments").doc(id);

    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      if (!doc.exists) {
        return { error: 404, message: "Appointment not found." };
      }
      const appointment = doc.data();

      if (appointment.status !== "awaiting_doctor_claim") {
        return { error: 409, message: "This request has already been claimed or is no longer available." };
      }

      const updates = {
        doctorId: doctor.uid,
        doctorName: doctor.fullName,
        status: "in_session",
        acceptedAt: new Date().toISOString(),
      };
      transaction.update(ref, updates);

      return { appointment: { ...appointment, ...updates } };
    });

    if (result.error) {
      return res.status(result.error).json({ success: false, message: result.message });
    }

    return res.json({ success: true, message: "Consultation claimed.", appointment: result.appointment });
  } catch (err) {
    console.error("[acceptAppointment] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not claim this consultation." });
  }
}

/**
 * POST /api/appointments/:id/pass (doctor only)
 */
async function passAppointment(req, res) {
  const { id } = req.params;
  const doctor = req.user;

  try {
    const ref = db.collection("appointments").doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }
    if (doc.data().status !== "awaiting_doctor_claim") {
      return res.status(409).json({ success: false, message: "This request is no longer available." });
    }

    await ref.update({ passedBy: admin.firestore.FieldValue.arrayUnion(doctor.uid) });
    return res.json({ success: true, message: "Passed." });
  } catch (err) {
    console.error("[passAppointment] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not pass on this request." });
  }
}

/**
 * GET /api/appointments/available (doctor only)
 * The doctor-facing broadcast/claim queue.
 */
async function listAvailableAppointments(req, res) {
  try {
    const snap = await db.collection("appointments").where("status", "==", "awaiting_doctor_claim").get();
    const appointments = snap.docs.map((d) => d.data()).filter((a) => !(a.passedBy || []).includes(req.user.uid));
    return res.json({ success: true, appointments });
  } catch (err) {
    console.error("[listAvailableAppointments] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not load available appointments." });
  }
}

/**
 * GET /api/appointments/mine (doctor only) — appointments this doctor has
 * claimed, active or past.
 */
async function listMyAppointments(req, res) {
  try {
    const snap = await db
      .collection("appointments")
      .where("doctorId", "==", req.user.uid)
      .orderBy("createdAt", "desc")
      .get();
    return res.json({ success: true, appointments: snap.docs.map((d) => d.data()) });
  } catch (err) {
    console.error("[listMyAppointments] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not load appointments." });
  }
}

/**
 * GET /api/appointments (admin only) — every booking, any status.
 */
async function listAllAppointments(req, res) {
  try {
    const snap = await db.collection("appointments").orderBy("createdAt", "desc").get();
    return res.json({ success: true, appointments: snap.docs.map((d) => d.data()) });
  } catch (err) {
    console.error("[listAllAppointments] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not load appointments." });
  }
}

/**
 * GET /api/appointments/:id — accessible to the doctor/admin (normal
 * session) or the patient (guest token), via requireDoctorOrGuest. Used
 * for the Access Portal's status view (polling) and general lookups.
 */
async function getAppointmentById(req, res) {
  const { id } = req.params;

  try {
    const doc = await db.collection("appointments").doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }
    const appointment = doc.data();

    if (req.actor.type === "guest" && req.actor.appointmentId !== id) {
      return res.status(403).json({ success: false, message: "You do not have access to this appointment." });
    }
    if (req.actor.type === "user") {
      const isParticipant = req.actor.uid === appointment.doctorId;
      if (!isParticipant && req.actor.role !== "admin") {
        return res.status(403).json({ success: false, message: "You do not have access to this appointment." });
      }
    }

    return res.json({ success: true, appointment });
  } catch (err) {
    console.error("[getAppointmentById] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not load appointment." });
  }
}

/**
 * POST /api/appointments/:id/video-token — either the claimed doctor
 * (normal session) or the patient (guest token) via requireDoctorOrGuest.
 */
async function getVideoToken(req, res) {
  const { id } = req.params;

  try {
    const ref = db.collection("appointments").doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }
    const appointment = doc.data();

    const isGuestForThis = req.actor.type === "guest" && req.actor.appointmentId === id;
    const isAssignedDoctor = req.actor.type === "user" && req.actor.uid === appointment.doctorId;
    if (!isGuestForThis && !isAssignedDoctor) {
      return res.status(403).json({ success: false, message: "You are not part of this consultation." });
    }
    if (!["in_session"].includes(appointment.status) || !appointment.channelName) {
      return res.status(400).json({ success: false, message: "This consultation is not ready for video yet." });
    }

    const seed = req.actor.type === "guest" ? req.actor.appointmentId : req.actor.uid;
    const numericUid = parseInt(seed.replace(/\D/g, "").slice(0, 8) || "0", 10) || Math.floor(Math.random() * 100000);
    const tokenData = generateRtcToken(appointment.channelName, numericUid, "publisher");

    return res.json({ success: true, ...tokenData });
  } catch (err) {
    console.error("[getVideoToken] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not generate video token." });
  }
}

/**
 * PATCH /api/appointments/:id/status (doctor/admin) — "Mark Completed" /
 * cancel. Ending the call as the doctor is what triggers "completed"
 * (see ConsultationRoom.jsx), which in turn is what unlocks the patient's
 * rating prompt.
 */
async function updateAppointmentStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  const allowed = ["completed", "cancelled"];

  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of: ${allowed.join(", ")}.` });
  }

  try {
    const ref = db.collection("appointments").doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }
    const appointment = doc.data();
    if (req.user.role === "doctor" && appointment.doctorId !== req.user.uid) {
      return res.status(403).json({ success: false, message: "Not your consultation." });
    }

    await ref.update({ status, updatedAt: new Date().toISOString() });
    return res.json({ success: true, message: "Appointment updated." });
  } catch (err) {
    console.error("[updateAppointmentStatus] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not update appointment." });
  }
}

/**
 * POST /api/appointments/:id/rating (guest only, via requireGuestAccess)
 * Star rating + feedback, submitted through the backend like every other
 * write in this app (Firestore rules deny all client writes) rather than
 * from the browser directly, keeping the same security model used
 * everywhere else.
 */
async function submitRating(req, res) {
  const { id } = req.params;
  const { rating, feedback } = req.body;

  const parsedRating = parseInt(rating, 10);
  if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return res.status(400).json({ success: false, message: "rating must be an integer from 1 to 5." });
  }

  try {
    const ref = db.collection("appointments").doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }
    const appointment = doc.data();
    if (appointment.status !== "completed") {
      return res.status(400).json({ success: false, message: "This consultation isn't completed yet." });
    }
    if (appointment.rating) {
      return res.status(409).json({ success: false, message: "A rating has already been submitted." });
    }

    await ref.update({
      rating: parsedRating,
      feedback: (feedback || "").trim(),
      ratedAt: new Date().toISOString(),
    });

    return res.json({ success: true, message: "Thank you for your feedback." });
  } catch (err) {
    console.error("[submitRating] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not submit rating." });
  }
}

/**
 * POST /api/appointments/:id/reset-pin (admin only) — support override for
 * a locked PIN.
 */
async function resetPin(req, res) {
  const { id } = req.params;

  try {
    const ref = db.collection("appointments").doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }
    await ref.update({ pinStatus: "active", pinFailedAttempts: 0 });
    return res.json({ success: true, message: "PIN unlocked." });
  } catch (err) {
    console.error("[resetPin] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not reset PIN." });
  }
}

module.exports = {
  bookAppointment,
  authorizePayment,
  guestAccess,
  acceptAppointment,
  passAppointment,
  listAvailableAppointments,
  listMyAppointments,
  listAllAppointments,
  getAppointmentById,
  getVideoToken,
  updateAppointmentStatus,
  submitRating,
  resetPin,
};
