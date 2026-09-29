import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { saveGuestSession, getGuestSession, guestApi } from "../lib/guestSession";
import StatusBadge from "../components/StatusBadge";
import Spinner from "../components/Spinner";

const POLL_INTERVAL_MS = 5000;
const ACTIVE_STATUSES = ["pending_payment_verification", "awaiting_doctor_claim"];

export default function AccessPortal() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [session, setSession] = useState(null); // { appointmentId, guestToken }
  const [appointment, setAppointment] = useState(null);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [ratingError, setRatingError] = useState("");

  const pollRef = useRef(null);

  // If this tab already has a valid guest session (e.g. the patient just
  // came from GuestBooking, or navigated back from the video call), skip
  // straight to the status view instead of asking for the PIN again.
  useEffect(() => {
    const existing = getGuestSession();
    if (!existing) return;
    guestApi
      .getAppointment(existing.appointmentId, existing.guestToken)
      .then(({ data }) => {
        setSession(existing);
        setAppointment(data.appointment);
      })
      .catch(() => {
        /* stale/expired session — fall through to the login form */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { data } = await api.post("/appointments/access", { phone, pin });
      saveGuestSession(data.appointment.id, data.guestToken);
      setSession({ appointmentId: data.appointment.id, guestToken: data.guestToken });
      setAppointment(data.appointment);
    } catch (err) {
      setError(err.response?.data?.message || "Could not verify your details. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Poll for status changes while the booking is still pending, so the
  // patient sees "a doctor accepted!" without needing to manually refresh.
  useEffect(() => {
    if (!session || !appointment) return;
    if (!ACTIVE_STATUSES.includes(appointment.status)) return;

    pollRef.current = setInterval(async () => {
      try {
        const { data } = await guestApi.getAppointment(session.appointmentId, session.guestToken);
        setAppointment(data.appointment);
      } catch (err) {
        // Silent — a transient poll failure just tries again next interval.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(pollRef.current);
  }, [session, appointment?.status]);

  const joinVideo = () => navigate(`/call/${appointment.id}`);

  const submitRating = async (e) => {
    e.preventDefault();
    if (rating < 1) return;
    setRatingError("");
    try {
      await guestApi.submitRating(session.appointmentId, session.guestToken, { rating, feedback });
      setRatingSubmitted(true);
    } catch (err) {
      setRatingError(err.response?.data?.message || "Could not submit your rating.");
    }
  };

  // --- Login form ---
  if (!appointment) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12 sm:px-6">
        <div className="mb-8 text-center">
          <img src="/logo.jpeg" alt="Medora Consult logo" className="mx-auto h-14 w-14 rounded object-contain" />
          <h1 className="mt-4 text-2xl font-bold text-navy">Access Portal</h1>
          <p className="mt-1 text-sm text-slate-500">Enter your phone number and access PIN to continue.</p>
        </div>

        <form onSubmit={handleLogin} className="card space-y-4">
          {error && <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</div>}

          <div>
            <label className="label">Phone number</label>
            <input
              required
              className="input"
              placeholder="+233 24 000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div>
            <label className="label">6-digit Access PIN</label>
            <input
              type="text"
              inputMode="numeric"
              required
              className="input text-center text-xl font-bold tracking-[0.4em]"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="——————"
            />
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Checking…" : "Continue"}
          </button>
        </form>
      </div>
    );
  }

  // --- Completed: rating prompt ---
  if (appointment.status === "completed") {
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <div className="card text-center">
          <h1 className="text-xl font-bold text-navy">Your consultation is complete</h1>
          <p className="mt-1 text-sm text-slate-500">{appointment.serviceName} • {appointment.humanId}</p>

          {appointment.rating || ratingSubmitted ? (
            <p className="mt-6 text-sm text-teal-dark">Thank you for your feedback!</p>
          ) : (
            <form onSubmit={submitRating} className="mt-6 space-y-4 text-left">
              {ratingError && <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{ratingError}</div>}
              <div>
                <p className="label text-center">How was your consultation?</p>
                <div className="flex justify-center gap-2 text-3xl">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      type="button"
                      key={n}
                      onClick={() => setRating(n)}
                      className={n <= rating ? "text-amber-400" : "text-slate-200"}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                className="input"
                rows={3}
                placeholder="Optional feedback…"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
              <button type="submit" disabled={rating < 1} className="btn-primary w-full">
                Submit Rating
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // --- Cancelled ---
  if (appointment.status === "cancelled") {
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <div className="card text-center">
          <h1 className="text-xl font-bold text-navy">This booking was cancelled</h1>
          <p className="mt-2 text-sm text-slate-500">Please contact support or make a new booking if needed.</p>
        </div>
      </div>
    );
  }

  // --- Active states: waiting for payment verification / doctor / join video ---
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <div className="card text-center">
        <div className="flex items-center justify-between text-left">
          <div>
            <p className="text-sm font-semibold text-navy">{appointment.serviceName}</p>
            <p className="text-xs text-slate-400">{appointment.humanId}</p>
          </div>
          <StatusBadge status={appointment.status} />
        </div>

        {appointment.status === "pending_payment_verification" && (
          <>
            <p className="mt-6 flex items-center justify-center gap-2 text-sm font-medium text-amber-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              Waiting for our team to verify your MoMo payment…
            </p>
            <p className="mt-2 text-xs text-slate-400">
              This page updates automatically. You'll also get an SMS and email once confirmed.
            </p>
          </>
        )}

        {appointment.status === "awaiting_doctor_claim" && (
          <>
            <p className="mt-6 flex items-center justify-center gap-2 text-sm font-medium text-amber-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              Payment confirmed — waiting for an available doctor…
            </p>
          </>
        )}

        {appointment.status === "in_session" && (
          <>
            <p className="mt-6 text-sm text-slate-600">
              Dr. {appointment.doctorName} has accepted your consultation.
            </p>
            <button onClick={joinVideo} className="btn-primary mt-4 w-full">
              Join Video Consultation
            </button>
          </>
        )}
      </div>
    </div>
  );
}
