import { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../lib/firebaseClient";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      // Always show success, even if the email doesn't exist — this avoids
      // leaking which emails are registered.
      setSent(true);
    } catch (err) {
      if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else {
        // Still show success for unknown-account cases to avoid email enumeration.
        setSent(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[75vh] max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div className="mb-8 text-center">
        <img src="/logo.jpeg" alt="Medora Consult logo" className="mx-auto h-14 w-14 rounded object-contain" />
        <h1 className="mt-4 text-2xl font-bold text-navy">Reset your password</h1>
        <p className="mt-1 text-sm text-slate-500">We'll email you a secure link to choose a new one.</p>
      </div>

      {sent ? (
        <div className="card space-y-4 text-center">
          <div className="rounded-lg bg-teal/10 px-3.5 py-3 text-sm text-teal-dark">
            If an account exists for <span className="font-semibold">{email}</span>, a password reset
            link is on its way. Check your inbox (and spam folder).
          </div>
          <Link to="/login" className="btn-secondary w-full">
            Back to login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</div>}

          <div>
            <label className="label" htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        Remembered your password?{" "}
        <Link to="/login" className="font-semibold text-teal-dark hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
