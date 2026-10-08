import axios from "axios";

// Production: frontend (Firebase Hosting) and API (Render) are different
// origins, so requests go to the absolute backend URL. Override at build time
// with VITE_API_URL. In dev, leave VITE_API_URL unset and set
// VITE_USE_PROXY=true to use the Vite "/api" proxy instead.
const PROD_API_ORIGIN = "https://medora-consult-backend.onrender.com";

const configuredOrigin = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
const useProxy = import.meta.env.DEV && import.meta.env.VITE_USE_PROXY === "true";

const API_ORIGIN = useProxy ? "" : configuredOrigin || PROD_API_ORIGIN;

const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  withCredentials: true, // send/receive the httpOnly session cookie cross-origin
  timeout: 30000, // Render free instances can take a while to wake up
});

// Attach the token as a Bearer header too (in addition to the httpOnly
// cookie) so auth still works where third-party cookies are blocked.
// Guest calls set their own Authorization header — never overwrite it.
// Note: no custom Content-Type is forced here; axios sets it per request.
api.interceptors.request.use((config) => {
  if (config.headers.Authorization) return config;
  const token = localStorage.getItem("medora_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If the API is ever answered by the SPA host, axios gets a 200 HTML string
// and `data.services` etc. would be undefined. Reject so .catch() runs.
api.interceptors.response.use((response) => {
  const ct = String(response.headers?.["content-type"] || "");
  if (typeof response.data === "string" && ct.includes("text/html")) {
    return Promise.reject(new Error("API returned HTML — check VITE_API_URL / hosting rewrites."));
  }
  return response;
});

// Always returns an array, whatever the payload looked like.
export const asArray = (value) => (Array.isArray(value) ? value : []);

export default api;
