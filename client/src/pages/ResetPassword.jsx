import { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { checkPasswordResetCode, confirmPasswordReset } from "../lib/firebaseClient";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const oobCode = searchParams.get("oobCode");

  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [codeError, setCodeError] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!oobCode) {
      setCodeError("This password reset link is missing or malformed.");
      setChecking(false);
      return;
    }

    checkPasswordResetCode(oobCode)
      .then((verifiedEmail) => {
        setEmail(verifiedEmail);
        setChecking(false);
      })
      .catch(() => {
        setCodeError("This password reset link is invalid or has expired. Please request a new one.");
        setChecking(false);
      });
  }, [oobCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(oobCode, password);
      setDone(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      setFormError("Could not reset your password. The link may have expired — please request a new one.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[75vh] max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div className="mb-8 text-center">
        <img src="/logo.jpeg" alt="Medora Consult logo" className="mx-auto h-14 w-14 rounded object-contain" />
        <h1 className="mt-4 text-2xl font-bold text-navy">Choose a new password</h1>
        {email && <p className="mt-1 text-sm text-slate-500">Resetting password for {email}</p>}
      </div>

      {checking ? (
        <div className="card flex items-center justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal/30 border-t-teal" />
        </div>
      ) : codeError ? (
        <div className="card space-y-4 text-center">
          <div className="rounded-lg bg-red-50 px-3.5 py-3 text-sm text-red-700">{codeError}</div>
          <Link to="/forgot-password" className="btn-primary w-full">
            Request a new link
          </Link>
        </div>
      ) : done ? (
        <div className="card space-y-4 text-center">
          <div className="rounded-lg bg-teal/10 px-3.5 py-3 text-sm text-teal-dark">
            Your password has been reset. Redirecting you to login…
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card space-y-4">
          {formError && <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{formError}</div>}

          <div>
            <label className="label" htmlFor="password">New password</label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <p className="mt-1 text-xs text-slate-400">At least 8 characters.</p>
          </div>

          <div>
            <label className="label" htmlFor="confirmPassword">Confirm new password</label>
            <input
              id="confirmPassword"
              type="password"
              required
              className="input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Resetting…" : "Reset password"}
          </button>
        </form>
      )}
    </div>
  );
}
