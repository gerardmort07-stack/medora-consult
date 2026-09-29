const express = require("express");
const { verifyPayment } = require("../controllers/paymentsController");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.post("/verify", requireAuth, requireRole("patient"), verifyPayment);

module.exports = router;
