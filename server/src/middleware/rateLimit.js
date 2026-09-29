/**
 * Minimal in-memory sliding-window rate limiter, keyed by IP. Good enough
 * for a single-process deployment at this app's scale — swap for a
 * Redis-backed limiter if the app is ever run across multiple instances.
 *
 * Used specifically on POST /api/appointments/access: the appointment-level
 * pinStatus lockout (see appointmentController) only ever engages when a
 * PIN actually matches a real booking. A random guess that matches nothing
 * has no document to attach a failure count to, so this IP-level limiter
 * is the real defense against brute-forcing the 900,000-value PIN space.
 */
function rateLimit({ windowMs, max }) {
  const hits = new Map(); // ip -> [timestamps]

  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    const now = Date.now();
    const windowStart = now - windowMs;

    const recent = (hits.get(ip) || []).filter((t) => t > windowStart);
    recent.push(now);
    hits.set(ip, recent);

    if (recent.length > max) {
      return res.status(429).json({
        success: false,
        message: "Too many attempts. Please wait a few minutes before trying again.",
      });
    }

    next();
  };
}

module.exports = { rateLimit };
