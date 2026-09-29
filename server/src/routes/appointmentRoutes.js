const express = require("express");
const {
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
} = require("../controllers/appointmentController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { requireGuestAccess, requireDoctorOrGuest } = require("../middleware/guestAuth");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();

const guestAccessLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15 }); // 15 attempts / 15 min / IP

// --- Public: no account, no login ---
router.post("/", bookAppointment);
router.post("/access", guestAccessLimiter, guestAccess);

// --- Admin ---
router.get("/", requireAuth, requireRole("admin"), listAllAppointments);
router.post("/:id/authorize-payment", requireAuth, requireRole("admin"), authorizePayment);
router.post("/:id/reset-pin", requireAuth, requireRole("admin"), resetPin);

// --- Doctor ---
router.get("/mine", requireAuth, requireRole("doctor"), listMyAppointments);
router.get("/available", requireAuth, requireRole("doctor"), listAvailableAppointments);
router.post("/:id/accept", requireAuth, requireRole("doctor"), acceptAppointment);
router.post("/:id/pass", requireAuth, requireRole("doctor"), passAppointment);
router.patch("/:id/status", requireAuth, requireRole("doctor", "admin"), updateAppointmentStatus);

// --- Guest (patient) ---
router.post("/:id/rating", requireGuestAccess, submitRating);

// --- Shared: doctor OR guest, distinguished inside the controller ---
router.post("/:id/video-token", requireDoctorOrGuest, getVideoToken);

// IMPORTANT: this generic single-segment GET must be registered LAST among
// GET routes on this router, so it never shadows "/mine" or "/available".
router.get("/:id", requireDoctorOrGuest, getAppointmentById);

module.exports = router;
