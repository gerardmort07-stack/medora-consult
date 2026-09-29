const express = require("express");
const {
  listActiveServices,
  listAllServices,
  createService,
  updateService,
  deleteService,
} = require("../controllers/serviceController");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Public — active services & pricing are non-sensitive reference data shown
// on the landing page before a visitor has even registered.
router.get("/", listActiveServices);
router.get("/all", requireAuth, requireRole("admin"), listAllServices);
router.post("/", requireAuth, requireRole("admin"), createService);
router.patch("/:id", requireAuth, requireRole("admin"), updateService);
router.delete("/:id", requireAuth, requireRole("admin"), deleteService);

module.exports = router;
