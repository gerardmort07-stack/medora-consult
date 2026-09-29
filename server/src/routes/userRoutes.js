const express = require("express");
const {
  listActiveDoctors,
  listAllUsers,
  setUserStatus,
  getSystemStats,
  addAppointmentNote,
} = require("../controllers/userController");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/doctors", requireAuth, listActiveDoctors);
router.get("/", requireAuth, requireRole("admin"), listAllUsers);
router.get("/stats", requireAuth, requireRole("admin"), getSystemStats);
router.patch("/:uid/approve", requireAuth, requireRole("admin"), setUserStatus);
router.post("/appointments/:id/notes", requireAuth, requireRole("doctor"), addAppointmentNote);

module.exports = router;
