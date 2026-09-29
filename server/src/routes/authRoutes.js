const express = require("express");
const { register, login, me, logout, getFirebaseCustomToken } = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
// No requireAuth here — /me is a session-restore check that must always
// respond 200 (with user: null when logged out), not 401. See the
// controller for why this is the one deliberate exception.
router.get("/me", me);
router.get("/firebase-token", requireAuth, getFirebaseCustomToken);

module.exports = router;
