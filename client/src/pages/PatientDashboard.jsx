import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { firestore, ensureFirebaseAuthSession } from "../lib/firebaseClient";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import DisclaimerBanner from "../components/DisclaimerBanner";
import Spinner from "../components/Spinner";

function formatGHS(kobo) {
  return `GH₵ ${(kobo / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export default function PatientDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [listenerReady, setListenerReady] = useState(false);

  const [bookingService, setBookingService] = useState(null);
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [booking, setBooking] = useState(false);
  const [feedback, setFeedback] = useState("");

  // Shown immediately after a successful Paystack onSuccess callback, while
  // the real-time listener catches up — this is what displays the freshly
  // generated consultation access PIN without waiting on a page refresh.
  const [confirmedAppointment, setConfirmedAppointment] = useState(null);

  // Load the active services list once.
  useEffect(() => {
    api
      .get("/services")
      .then(({ data }) => setServices(data.services))
      .catch(() => setServices([]))
      .finally(() => setLoadingServices(false));
  }, []);

  // Handles the FALLBACK path only: if the Paystack Inline popup script
  // couldn't load, the patient was sent through a full-page redirect
  // instead (see launchPaystackInline below) and lands back here with
  // ?paystackRedirect=1&appointmentId=...&reference=... in the URL. The
  // primary Inline flow never hits this — its callback fires immediately,
  // client-side, without ever touching the URL. Runs once on mount.
  useEffect(() => {
    if (searchParams.get("paystackRedirect") !== "1") return;

    const appointmentId = searchParams.get("appointmentId");
    const reference = searchParams.get("reference");
    setSearchParams({}, { replace: true }); // scrub the params either way

    if (appointmentId && reference) {
      verifyAndConfirm(reference, appointmentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time listener on the patient's own appointments — so the moment a
  // doctor accepts (or the payment webhook confirms), the status updates
  // live without a manual refresh.
  useEffect(() => {
    if (!user?.uid) return;
    let unsubscribe = () => {};

    ensureFirebaseAuthSession()
      .then(() => {
        const q = query(
          collection(firestore, "appointments"),
          where("patientId", "==", user.uid),
          orderBy("createdAt", "desc")
        );
        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            setAppointments(snapshot.docs.map((d) => d.data()));
            setListenerReady(true);
          },
          () => fallbackLoadAppointments()
        );
      })
      .catch(() => fallbackLoadAppointments());

    return () => unsubscribe();
  }, [user?.uid]);

  const fallbackLoadAppointments = () => {
    api
      .get("/appointments/mine")
      .then(({ data }) => setAppointments(data.appointments))
      .finally(() => setListenerReady(true));
  };

  const openBookingModal = (service) => {
    setBookingService(service);
    setChiefComplaint("");
    setFeedback("");
  };

  /**
   * Called the instant Paystack's checkout reports success (either the
   * Inline popup's onSuccess callback, or — as a fallback — right after a
   * full-page redirect back from Paystack's hosted checkout). Immediately
   * triggers server-side verification so status/PIN update without waiting
   * on webhook delivery latency.
   */
  const verifyAndConfirm = async (reference, appointmentId) => {
    try {
      const { data } = await api.post("/payments/verify", { reference, appointmentId });
      setBookingService(null);
      setConfirmedAppointment(data.appointment);
    } catch (err) {
      setFeedback(
        err.response?.data?.message ||
          "Payment received, but we couldn't confirm it automatically. It will update shortly — check Your Active Requests below."
      );
      setBooking(false);
    }
  };

  const launchPaystackInline = (appointment) => {
    const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;

    if (!window.PaystackPop || !publicKey) {
      // Fallback: server-initialized redirect flow (still verified via the
      // webhook and the GET /api/appointments/verify/:reference endpoint).
      setFeedback("Redirecting you to a secure payment page…");
      return false;
    }

    const handler = window.PaystackPop.setup({
      key: publicKey,
      email: user.email,
      amount: appointment.priceKobo,
      currency: "GHS",
      ref: appointment.paymentReference,
      onClose: () => setBooking(false),
      callback: (transaction) => {
        verifyAndConfirm(transaction.reference, appointment.id);
      },
    });
    handler.openIframe();
    return true;
  };

  const submitBooking = async (e) => {
    e.preventDefault();
    setBooking(true);
    setFeedback("");
    try {
      const { data } = await api.post("/appointments", {
        serviceId: bookingService.id,
        chiefComplaint,
      });

      const launchedInline = launchPaystackInline(data.appointment);
      if (!launchedInline) {
        if (data.payment?.authorizationUrl) {
          window.location.href = data.payment.authorizationUrl;
        } else {
          setFeedback("Booking created, but payment could not be initialized. Please contact support.");
          setBooking(false);
        }
      }
    } catch (err) {
      setFeedback(err.response?.data?.message || "Booking failed. Please try again.");
      setBooking(false);
    }
  };

  const joinVideo = (appointmentId) => navigate(`/video/${appointmentId}`);

  const activeAppointments = appointments.filter((a) => a.status !== "completed" && a.status !== "cancelled");
  const pastAppointments = appointments.filter((a) => a.status === "completed" || a.status === "cancelled");

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-navy">Welcome back, {user.fullName.split(" ")[0]}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Choose a service, describe what's going on, and pay — a doctor will pick up your request as soon
        as one becomes available.
      </p>

      {/* Service selection */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-navy">Request a Consultation</h2>
        {loadingServices ? (
          <Spinner label="Loading services…" />
        ) : services.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No services are currently available. Please check back soon.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <div key={service.id} className="card flex flex-col justify-between">
                <div>
                  <p className="text-sm font-semibold text-navy">{service.name}</p>
                  {service.description && <p className="mt-1.5 text-xs text-slate-500">{service.description}</p>}
                  <p className="mt-3 text-lg font-bold text-teal-dark">{formatGHS(service.priceKobo)}</p>
                </div>
                <button onClick={() => openBookingModal(service)} className="btn-primary mt-4 w-full">
                  Request this service
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Active requests */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold text-navy">Your Active Requests</h2>
        {!listenerReady ? (
          <Spinner label="Loading your requests…" />
        ) : activeAppointments.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">You have no active requests.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {activeAppointments.map((appt) => (
              <div key={appt.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-navy">{appt.serviceName}</p>
                    <p className="text-xs text-slate-400">{appt.humanId}</p>
                  </div>
                  <StatusBadge status={appt.status === "awaiting_payment" ? appt.paymentStatus : appt.status} />
                </div>

                {appt.status === "pending_claim" && (
                  <>
                    <p className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-600">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                      Waiting for an available doctor to accept your request…
                    </p>
                    {appt.consultationPin && (
                      <p className="mt-2 text-xs text-slate-400">
                        Access PIN: <span className="font-mono font-semibold text-navy">{appt.consultationPin}</span>
                      </p>
                    )}
                  </>
                )}
                {(appt.status === "accepted" || appt.status === "in_consultation") && (
                  <p className="mt-3 text-xs text-slate-500">
                    Dr. {appt.doctorName} has accepted your request.
                  </p>
                )}

                {["accepted", "in_consultation"].includes(appt.status) && (
                  <button onClick={() => joinVideo(appt.id)} className="btn-primary mt-4 w-full !text-xs">
                    Join video consultation
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* History */}
      {pastAppointments.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold text-navy">History</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pastAppointments.map((appt) => (
                  <tr key={appt.id}>
                    <td className="px-4 py-3 font-medium text-navy">{appt.humanId}</td>
                    <td className="px-4 py-3">{appt.serviceName}</td>
                    <td className="px-4 py-3">{appt.doctorName || "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={appt.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Booking modal */}
      {bookingService && (
        <div className="modal-backdrop">
          <div className="modal-panel w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-navy">{bookingService.name}</h3>
            <p className="mt-1 text-sm text-teal-dark">{formatGHS(bookingService.priceKobo)}</p>

            <form onSubmit={submitBooking} className="mt-4 space-y-4">
              {feedback && <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{feedback}</div>}

              <div>
                <label className="label">Chief complaint / clinical details</label>
                <textarea
                  className="input"
                  rows={4}
                  required
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  placeholder="Briefly describe your symptoms or reason for this consultation…"
                />
              </div>

              <p className="text-xs text-slate-400">
                Your request will be sent to every available doctor the moment payment is confirmed —
                no need to wait for a specific doctor's schedule. You'll receive a secret access PIN by
                SMS and email to unlock your video consultation.
              </p>

              <DisclaimerBanner compact />

              <div className="flex gap-3">
                <button type="button" onClick={() => setBookingService(null)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={booking} className="btn-primary flex-1">
                  {booking ? "Processing…" : "Continue to payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Booking confirmed — shows the freshly generated access PIN */}
      {confirmedAppointment && (
        <div className="modal-backdrop">
          <div className="modal-panel w-full max-w-md rounded-xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal/10 text-2xl text-teal-dark">
              ✓
            </div>
            <h3 className="mt-4 text-lg font-bold text-navy">Booking Confirmed</h3>
            <p className="mt-1 text-sm text-slate-500">
              {confirmedAppointment.serviceName} • {confirmedAppointment.humanId}
            </p>

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Your Consultation Access Code
            </p>
            <p className="mt-2 rounded-lg bg-teal/10 py-3 font-mono text-3xl font-bold tracking-[0.3em] text-teal-dark">
              {confirmedAppointment.consultationPin}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              We've also sent this code by SMS and email. You'll need it to join your video consultation.
            </p>

            <p className="mt-5 flex items-center justify-center gap-2 text-xs font-medium text-amber-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              Waiting for a doctor to accept your request…
            </p>

            <button onClick={() => setConfirmedAppointment(null)} className="btn-primary mt-6 w-full">
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
