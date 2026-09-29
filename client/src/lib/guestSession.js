import api from "./api";

const STORAGE_KEY = "medora_guest_session";

/**
 * A guest patient has no account, so there is nothing equivalent to
 * AuthContext for them — just a short-lived, appointment-scoped token
 * (from POST /api/appointments/access) kept in sessionStorage (cleared
 * when the tab closes, unlike localStorage — appropriate for a shared or
 * borrowed phone at a clinic waiting room, say).
 */
export function saveGuestSession(appointmentId, guestToken) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ appointmentId, guestToken }));
}

export function getGuestSession(appointmentId) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (appointmentId && session.appointmentId !== appointmentId) return null;
    return session;
  } catch (err) {
    return null;
  }
}

export function clearGuestSession() {
  sessionStorage.removeItem(STORAGE_KEY);
}

function authHeader(guestToken) {
  return { headers: { Authorization: `Bearer ${guestToken}` } };
}

export const guestApi = {
  getAppointment: (appointmentId, guestToken) =>
    api.get(`/appointments/${appointmentId}`, authHeader(guestToken)),
  getVideoToken: (appointmentId, guestToken) =>
    api.post(`/appointments/${appointmentId}/video-token`, {}, authHeader(guestToken)),
  submitRating: (appointmentId, guestToken, { rating, feedback }) =>
    api.post(`/appointments/${appointmentId}/rating`, { rating, feedback }, authHeader(guestToken)),
};
