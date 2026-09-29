const jwt = require("jsonwebtoken");
const { db } = require("../config/firebaseAdmin");

/**
 * Extracts the JWT from either the httpOnly cookie ("medora_token") or the
 * Authorization: Bearer header, verifies it, loads the fresh Firestore
 * profile (so role/status changes take effect immediately), and attaches
 * it to req.user.
 */
async function requireAuth(req, res, next) {
  try {
    const bearerHeader = req.headers.authorization;
    const bearerToken = bearerHeader && bearerHeader.startsWith("Bearer ")
      ? bearerHeader.slice(7)
      : null;
    const token = req.cookies?.medora_token || bearerToken;

    if (!token) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: "Invalid or expired session. Please log in again." });
    }

    const profileSnap = await db.collection("users").doc(decoded.uid).get();
    if (!profileSnap.exists) {
      return res.status(401).json({ success: false, message: "Account no longer exists." });
    }

    const profile = profileSnap.data();

    if (profile.status === "pending" && profile.role === "doctor") {
      return res.status(403).json({
        success: false,
        message: "Your doctor account is pending admin approval.",
      });
    }

    req.user = { uid: decoded.uid, ...profile };
    next();
  } catch (err) {
    console.error("[auth middleware] Unexpected error:", err);
    res.status(500).json({ success: false, message: "Authentication check failed." });
  }
}

/**
 * Restricts a route to one or more roles. Must run after requireAuth.
 * @param  {...("patient"|"doctor"|"admin")} allowedRoles
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "You do not have permission to access this resource." });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
