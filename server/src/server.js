require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");

const { bootstrapMasterAdmin } = require("./controllers/authController");
const { seedDefaultServices } = require("./controllers/serviceController");
const authRoutes = require("./routes/authRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const userRoutes = require("./routes/userRoutes");
const serviceRoutes = require("./routes/serviceRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// Render terminates TLS at its proxy; trust it so req.ip (rate limiter) and
// secure cookies behave correctly.
app.set("trust proxy", 1);

// ---------------------------------------------------------------------------
// CORS — MUST be the first middleware, ahead of logging, cookies, body
// parsing, rate limiting and every route/auth handler. Browsers send an
// unauthenticated OPTIONS preflight before any credentialed cross-origin
// request; if anything else runs first (or the request reaches an auth
// handler), the preflight fails.
//
// Because the frontend sends cookies (withCredentials: true), the
// Access-Control-Allow-Origin header must echo ONE exact origin (never "*").
// ---------------------------------------------------------------------------
const DEFAULT_ALLOWED_ORIGINS = [
  "https://medora-consult.web.app",
  "https://medora-consult.firebaseapp.com",
  "http://localhost:5173",
  "http://localhost:3000",
];

// Optional extras via CLIENT_ORIGINS (comma-separated); merged with defaults,
// so the app still works if the variable is missing or mistyped on Render.
const extraOrigins = (process.env.CLIENT_ORIGINS || "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, ...extraOrigins]);

const ALLOWED_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS"; // PATCH: approve/status/services routes use it
const ALLOWED_HEADERS = "Content-Type, Authorization, X-Requested-With";

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Always tell caches the response depends on the caller's origin.
  res.vary("Origin");

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
    res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    res.setHeader("Access-Control-Max-Age", "86400"); // cache preflight 24h
  }

  // Answer every preflight right here — before cookies, auth or routing.
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(cookieParser());

app.use(express.json());

// --- API routes (all strictly prefixed with /api) ---
app.use("/api/auth", authRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/users", userRoutes);
app.use("/api/services", serviceRoutes);

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Medora Consult API is running.", timestamp: new Date().toISOString() });
});

// --- Serve the production React build ---
const clientDistPath = path.join(__dirname, "..", "..", "client", "dist");
app.use(express.static(clientDistPath));

// SPA fallback: any non-/api route falls through to React Router.
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"), (err) => {
    if (err) {
      res
        .status(200)
        .send(
          "Medora Consult API is running. Build the client with `npm run build` to serve the frontend."
        );
    }
  });
});

// --- Centralized error handler ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[unhandled error]", err);
  res.status(500).json({ success: false, message: "An unexpected server error occurred." });
});

app.listen(PORT, async () => {
  console.log(`\nMedora Consult server listening on port ${PORT} (${process.env.NODE_ENV || "development"})`);
  await bootstrapMasterAdmin();
  await seedDefaultServices();
});
