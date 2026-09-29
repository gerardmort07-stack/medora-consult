import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Load the project's single root .env (one file for both server and
  // client) instead of requiring a separate client/.env.
  envDir: "../",
  server: {
    port: 5173,
    proxy: {
      // In dev, Vite proxies /api to the Express server so fetch("/api/...")
      // works identically to production (no CORS setup needed either way).
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
