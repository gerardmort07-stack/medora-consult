import axios from "axios";

// All requests are relative ("/api/...") so the app works identically in
// dev (Vite proxy) and production (same-origin Express) with zero CORS
// configuration and no hardcoded domain.
const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

// Also attach the token as a Bearer header (in addition to the httpOnly
// cookie) so the app still works if cookies are blocked in the user's
// browser. Guest (patient) calls pass their own appointment-scoped guest
// token explicitly per-request (see AccessPortal.jsx / ConsultationRoom.jsx)
// — never overwrite an Authorization header a call has already set.
api.interceptors.request.use((config) => {
  if (config.headers.Authorization) return config;
  const token = localStorage.getItem("medora_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
