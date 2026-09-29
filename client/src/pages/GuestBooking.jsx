import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import DisclaimerBanner from "../components/DisclaimerBanner";
import Spinner from "../components/Spinner";

function formatGHS(kobo) {
  return `GH₵ ${(kobo / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export default function GuestBooking() {
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);

  const [form, setForm] = useState({
    serviceId: "",
    consultationType: "immediate",
    scheduledFor: "",
    patientName: "",
    patientPhone: "",
    patientEmail: "",
    chiefComplaint: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null); // { appointment, momo }

  useEffect(() => {
    api
      .get("/services")
      .then(({ data }) => {
        setServices(data.services);
        if (data.services.length > 0) {
          setForm((f) => ({ ...f, serviceId: data.services[0].id }));
        }
      })
      .catch(() => setServices([]))
      .finally(() => setLoadingServices(false));
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { data } = await api.post("/appointments", form);
      setConfirmation({ appointment: data.appointment, momo: data.momo });
    } catch (err) {
      setError(err.response?.data?.message || "Could not create your booking. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedService = services.find((s) => s.id === form.serviceId);

  if (confirmation) {
    const { appointment, momo } = confirmation;
    return (
      <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
        <div className="card text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal/10 text-2xl text-teal-dark">
            📱
          </div>
          <h1 className="mt-4 text-xl font-bold text-navy">Complete Your Payment via MoMo</h1>
          <p className="mt-1 text-sm text-slate-500">{appointment.serviceName} • {appointment.humanId}</p>

          <div className="mt-6 space-y-2 rounded-lg bg-slate-50 p-4 text-left text-sm">
            <Row label="Send" value={formatGHS(appointment.priceKobo)} />
            <Row label="MoMo Number" value={momo.number} />
            <Row label="Account Name" value={momo.name} />
            <Row label="Reference" value={momo.reference} hint="Use your phone number as the payment reference" />
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Your Consultation Access Code
          </p>
          <p className="mt-2 rounded-lg bg-teal/10 py-3 font-mono text-3xl font-bold tracking-[0.3em] text-teal-dark">
            {appointment.consultationPin}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Save this PIN — you'll use it with your phone number at the Access Portal to check your booking
            and join your consultation. We'll also text and email it to you once your payment is confirmed.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <Link to="/access" className="btn-primary w-full">
              Go to Access Portal
            </Link>
            <Link to="/" className="btn-secondary w-full">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <div className="mb-8 text-center">
        <img src="/logo.jpeg" alt="Medora Consult logo" className="mx-auto h-14 w-14 rounded object-contain" />
        <h1 className="mt-4 text-2xl font-bold text-navy">Book a Consultation</h1>
        <p className="mt-1 text-sm text-slate-500">No account needed — pay by Mobile Money, get your access PIN.</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        {error && <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</div>}

        <div>
          <label className="label">Service</label>
          {loadingServices ? (
            <Spinner size="sm" />
          ) : (
            <select name="serviceId" required className="input" value={form.serviceId} onChange={handleChange}>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {formatGHS(s.priceKobo)}
                </option>
              ))}
            </select>
          )}
          {selectedService?.description && (
            <p className="mt-1 text-xs text-slate-400">{selectedService.description}</p>
          )}
        </div>

        <div>
          <label className="label">When do you need this consultation?</label>
          <div className="grid grid-cols-2 gap-3">
            {["immediate", "scheduled"].map((type) => (
              <button
                type="button"
                key={type}
                onClick={() => setForm({ ...form, consultationType: type })}
                className={`rounded-lg border px-4 py-2.5 text-sm font-semibold capitalize transition ${
                  form.consultationType === type
                    ? "border-teal bg-teal/10 text-teal-dark"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {form.consultationType === "scheduled" && (
          <div>
            <label className="label">Preferred date & time</label>
            <input
              type="datetime-local"
              name="scheduledFor"
              required
              className="input"
              value={form.scheduledFor}
              onChange={handleChange}
            />
          </div>
        )}

        <div>
          <label className="label">Full name</label>
          <input name="patientName" required className="input" value={form.patientName} onChange={handleChange} />
        </div>

        <div>
          <label className="label">Phone number</label>
          <input
            name="patientPhone"
            required
            className="input"
            placeholder="+233 24 000 0000"
            value={form.patientPhone}
            onChange={handleChange}
          />
          <p className="mt-1 text-xs text-slate-400">Used as your MoMo payment reference and your access login.</p>
        </div>

        <div>
          <label className="label">Email address</label>
          <input
            type="email"
            name="patientEmail"
            required
            className="input"
            value={form.patientEmail}
            onChange={handleChange}
          />
        </div>

        <div>
          <label className="label">Symptoms / reason for consultation</label>
          <textarea
            name="chiefComplaint"
            rows={3}
            className="input"
            value={form.chiefComplaint}
            onChange={handleChange}
            placeholder="Briefly describe what's going on…"
          />
        </div>

        <DisclaimerBanner compact />

        <button type="submit" disabled={submitting || loadingServices} className="btn-primary w-full">
          {submitting ? "Submitting…" : "Continue to Payment Instructions"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already booked?{" "}
        <Link to="/access" className="font-semibold text-teal-dark hover:underline">
          Go to Access Portal
        </Link>
      </p>
    </div>
  );
}

function Row({ label, value, hint }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-slate-500">{label}</span>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
      <span className="font-semibold text-navy">{value}</span>
    </div>
  );
}
