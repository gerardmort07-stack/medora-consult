const jwt = require("jsonwebtoken");

const GUEST_TOKEN_EXPIRES_IN = "6h";

/**
 * Guests never have a user account — there is no registration or login for
 * patients in this workflow. Instead, POST /api/appointments/access (see
 * appointmentController.guestAccess) validates a phone + PIN combination
 * against one specific appointment and, on success, issues one of these
 * tokens: a JWT scoped to exactly that appointmentId, valid for a few
 * hours, distinct in shape from a normal user session token (type: "guest")
 * so the two can never be confused by middleware that checks the wrong one.
 */
function signGuestToken(appointmentId) {
  return jwt.sign({ type: "guest", appointmentId }, process.env.JWT_SECRET, {
    expiresIn: GUEST_TOKEN_EXPIRES_IN,
  });
}

/**
 * Protects a guest-facing route. Requires a Bearer token whose decoded
 * appointmentId matches the :id route param, so a guest token issued for
 * one appointment can never be reused to poll or act on a different one.
 */
function requireGuestAccess(req, res, next) {
  const bearerHeader = req.headers.authorization;
  const token = bearerHeader && bearerHeader.startsWith("Bearer ") ? bearerHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: "Access token required." });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ success: false, message: "Your session has expired. Please enter your PIN again." });
  }

  if (decoded.type !== "guest" || decoded.appointmentId !== req.params.id) {
    return res.status(403).json({ success: false, message: "This access token is not valid for this appointment." });
  }

  req.guestAppointmentId = decoded.appointmentId;
  next();
}

/**
 * Used only by POST /:id/video-token, which both a doctor (normal user
 * session) and a guest patient (guest token) legitimately need to call.
 * Tries a normal user session first, then a guest token, and attaches a
 * uniform `req.actor` either way so the controller doesn't need two
 * separate code paths. Rejects if neither is valid.
 */
function requireDoctorOrGuest(req, res, next) {
  const bearerHeader = req.headers.authorization;
  const cookieToken = req.cookies?.medora_token;
  const bearerToken = bearerHeader && bearerHeader.startsWith("Bearer ") ? bearerHeader.slice(7) : null;
  const token = cookieToken || bearerToken;

  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired session." });
  }

  if (decoded.type === "guest") {
    if (decoded.appointmentId !== req.params.id) {
      return res.status(403).json({ success: false, message: "This access token is not valid for this appointment." });
    }
    req.actor = { type: "guest", appointmentId: decoded.appointmentId };
    return next();
  }

  // Otherwise this must be a normal doctor/admin session token — load the
  // full profile the same way requireAuth does, so req.actor.uid/role are
  // always trustworthy and reflect the current account state.
  const { db } = require("../config/firebaseAdmin");
  db.collection("users")
    .doc(decoded.uid)
    .get()
    .then((profileSnap) => {
      if (!profileSnap.exists) {
        return res.status(401).json({ success: false, message: "Account no longer exists." });
      }
      req.actor = { type: "user", uid: decoded.uid, ...profileSnap.data() };
      next();
    })
    .catch((err) => {
      console.error("[requireDoctorOrGuest] Failed to load profile:", err.message);
      res.status(500).json({ success: false, message: "Authentication check failed." });
    });
}

module.exports = { signGuestToken, requireGuestAccess, requireDoctorOrGuest };
