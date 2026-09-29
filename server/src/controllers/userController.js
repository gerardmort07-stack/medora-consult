const { db } = require("../config/firebaseAdmin");

/**
 * GET /api/users/doctors
 * Public-ish directory of active, approved doctors (patients use this to
 * choose who to book with).
 */
async function listActiveDoctors(req, res) {
  try {
    const snap = await db.collection("users").where("role", "==", "doctor").where("status", "==", "active").get();
    const doctors = snap.docs.map((d) => {
      const { ...profile } = d.data();
      return profile;
    });
    return res.json({ success: true, doctors });
  } catch (err) {
    console.error("[listActiveDoctors] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not load doctor directory." });
  }
}

/**
 * GET /api/users (admin only)
 * Full user list for the admin dashboard, optionally filtered by role/status.
 */
async function listAllUsers(req, res) {
  const { role, status } = req.query;

  try {
    let query = db.collection("users");
    if (role) query = query.where("role", "==", role);
    if (status) query = query.where("status", "==", status);

    const snap = await query.get();
    const users = snap.docs.map((d) => d.data());
    return res.json({ success: true, users });
  } catch (err) {
    console.error("[listAllUsers] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not load users." });
  }
}

/**
 * PATCH /api/users/:uid/approve (admin only)
 * One-click doctor approval toggle: sets a pending doctor to active, or
 * can be used to suspend an active one.
 */
async function setUserStatus(req, res) {
  const { uid } = req.params;
  const { status } = req.body;
  const allowed = ["active", "pending", "suspended"];

  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of: ${allowed.join(", ")}.` });
  }

  try {
    const ref = db.collection("users").doc(uid);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    await ref.update({ status, updatedAt: new Date().toISOString() });
    return res.json({ success: true, message: `User status updated to "${status}".` });
  } catch (err) {
    console.error("[setUserStatus] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not update user status." });
  }
}

/**
 * GET /api/users/stats (admin only)
 * Aggregate counts for the admin dashboard.
 */
async function getSystemStats(req, res) {
  try {
    const [usersSnap, appointmentsSnap] = await Promise.all([
      db.collection("users").get(),
      db.collection("appointments").get(),
    ]);

    const users = usersSnap.docs.map((d) => d.data());
    const appointments = appointmentsSnap.docs.map((d) => d.data());

    const stats = {
      totalUsers: users.length,
      totalDoctors: users.filter((u) => u.role === "doctor").length,
      pendingDoctors: users.filter((u) => u.role === "doctor" && u.status === "pending").length,
      totalAppointments: appointments.length,
      pendingPaymentVerification: appointments.filter((a) => a.status === "pending_payment_verification").length,
      awaitingDoctorClaim: appointments.filter((a) => a.status === "awaiting_doctor_claim").length,
      inSessionAppointments: appointments.filter((a) => a.status === "in_session").length,
      completedAppointments: appointments.filter((a) => a.status === "completed").length,
      totalRevenueKobo: appointments
        .filter((a) => a.paymentStatus === "paid")
        .reduce((sum, a) => sum + (a.priceKobo || 0), 0),
      averageRating: (() => {
        const rated = appointments.filter((a) => typeof a.rating === "number");
        if (!rated.length) return null;
        return Math.round((rated.reduce((sum, a) => sum + a.rating, 0) / rated.length) * 10) / 10;
      })(),
    };

    return res.json({ success: true, stats });
  } catch (err) {
    console.error("[getSystemStats] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not load system stats." });
  }
}

/**
 * POST /api/users/appointments/:id/notes (doctor only)
 * Quick clinical note attached to an appointment.
 */
async function addAppointmentNote(req, res) {
  const { id } = req.params;
  const { note } = req.body;

  if (!note || !note.trim()) {
    return res.status(400).json({ success: false, message: "Note text is required." });
  }

  try {
    const ref = db.collection("appointments").doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }
    if (doc.data().doctorId !== req.user.uid) {
      return res.status(403).json({ success: false, message: "Not your appointment." });
    }

    // Firestore admin's FieldValue lives on the top-level admin export, not db.
    const { admin } = require("../config/firebaseAdmin");
    await ref.update({
      notes: admin.firestore.FieldValue.arrayUnion({
        text: note.trim(),
        createdAt: new Date().toISOString(),
      }),
    });

    return res.json({ success: true, message: "Note added." });
  } catch (err) {
    console.error("[addAppointmentNote] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not add note." });
  }
}

module.exports = { listActiveDoctors, listAllUsers, setUserStatus, getSystemStats, addAppointmentNote };
