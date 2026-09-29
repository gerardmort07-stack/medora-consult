import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  // Patients never register — booking is guest-only (see /book). This form
  // is doctor sign-up only; admin accounts are bootstrapped, not self-served.
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    phone: "",
    role: "doctor",
  });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setSubmitting(true);
    const result = await register(form);
    setSubmitting(false);

    if (result.success) {
      if (result.user.status === "pending") {
        setInfo(result.message);
        return;
      }
      navigate("/doctor");
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="mx-auto flex min-h-[75vh] max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div className="mb-8 text-center">
        <img src="/logo.jpeg" alt="Medora Consult logo" className="mx-auto h-14 w-14 rounded object-contain" />
        <h1 className="mt-4 text-2xl font-bold text-navy">Doctor Registration</h1>
        <p className="mt-1 text-sm text-slate-500">
          Looking to book a consultation instead?{" "}
          <Link to="/book" className="font-semibold text-teal-dark hover:underline">
            Book here
          </Link>{" "}
          — no account needed.
        </p>
      </div>

      {info ? (
        <div className="card space-y-4 text-center">
          <div className="rounded-lg bg-teal/10 px-3.5 py-3 text-sm text-teal-dark">{info}</div>
          <Link to="/login" className="btn-primary w-full">
            Go to login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</div>}

          <p className="text-xs text-slate-400">
            Doctor accounts require admin approval before you can log in.
          </p>

          <div>
            <label className="label" htmlFor="fullName">Full name</label>
            <input id="fullName" name="fullName" required className="input" value={form.fullName} onChange={handleChange} />
          </div>

          <div>
            <label className="label" htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" required className="input" value={form.email} onChange={handleChange} />
          </div>

          <div>
            <label className="label" htmlFor="phone">Phone number</label>
            <input id="phone" name="phone" required className="input" placeholder="+233 24 000 0000" value={form.phone} onChange={handleChange} />
          </div>

          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required minLength={8} className="input" value={form.password} onChange={handleChange} />
            <p className="mt-1 text-xs text-slate-400">At least 8 characters.</p>
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Creating account…" : "Register as a doctor"}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-teal-dark hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
