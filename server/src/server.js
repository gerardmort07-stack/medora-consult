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

app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(cookieParser());

app.use(express.json());

// --- API routes (all strictly prefixed with /api, no CORS needed — same origin) ---
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
