import { useState } from "react";
import api from "../lib/api";

/**
 * Blocks access to the video consultation until the patient enters the
 * 6-digit access PIN they received via SMS and email when their booking
 * was confirmed. Calls POST /api/appointments/:id/verify-pin, which is the
 * server-side source of truth — this modal is a UX gate, not the security
 * boundary itself (getVideoToken re-checks pinStatus regardless).
 */
export default function PinVerificationModal({ appointmentId, onVerified, onCancel }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pin.length !== 6) return;
    setError("");
    setSubmitting(true);
    try {
      await api.post(`/appointments/${appointmentId}/verify-pin`, { pin });
      onVerified();
    } catch (err) {
      setError(err.response?.data?.message || "Incorrect PIN. Please try again.");
      setPin("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-panel w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal/10 text-teal-dark">
          🔒
        </div>
        <h3 className="mt-4 text-lg font-bold text-navy">Enter Your Access PIN</h3>
        <p className="mt-1 text-sm text-slate-500">
          Enter the 6-digit code we sent you by SMS and email when your booking was confirmed to unlock
          this consultation.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</div>}

          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoFocus
            required
            className="input text-center text-2xl font-bold tracking-[0.5em]"
            value={pin}
            onChange={handleChange}
            placeholder="——————"
            aria-label="6-digit access PIN"
          />

          <div className="flex gap-3">
            {onCancel && (
              <button type="button" onClick={onCancel} className="btn-secondary flex-1">
                Cancel
              </button>
            )}
            <button type="submit" disabled={submitting || pin.length !== 6} className="btn-primary flex-1">
              {submitting ? "Verifying…" : "Unlock Consultation"}
            </button>
          </div>
        </form>

        <p className="mt-4 text-xs text-slate-400">
          Didn't get your code, or locked out? Contact support for a PIN reset.
        </p>
      </div>
    </div>
  );
}
