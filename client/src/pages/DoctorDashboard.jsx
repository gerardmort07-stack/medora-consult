import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { firestore, ensureFirebaseAuthSession } from "../lib/firebaseClient";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import Spinner from "../components/Spinner";

export default function DoctorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [incoming, setIncoming] = useState([]);
  const [myAppointments, setMyAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listenerError, setListenerError] = useState("");
  const [claimingId, setClaimingId] = useState(null);
  const [claimError, setClaimError] = useState("");

  const [noteModal, setNoteModal] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Two real-time listeners: (1) the open broadcast/claim queue, filtered
  // client-side to hide anything this doctor already passed on, and
  // (2) appointments already claimed by this doctor and in session.
  useEffect(() => {
    if (!user?.uid) return;
    let unsubIncoming = () => {};
    let unsubMine = () => {};
    setLoading(true);

    ensureFirebaseAuthSession()
      .then(() => {
        const incomingQuery = query(
          collection(firestore, "appointments"),
          where("status", "==", "awaiting_doctor_claim")
        );
        unsubIncoming = onSnapshot(
          incomingQuery,
          (snapshot) => {
            setIncoming(snapshot.docs.map((d) => d.data()));
            setLoading(false);
          },
          (err) => {
            console.error("[DoctorDashboard] Incoming queue listener error:", err);
            setListenerError("Live queue updates are unavailable — showing last-loaded data.");
            fetchAvailableFallback();
          }
        );

        const mineQuery = query(
          collection(firestore, "appointments"),
          where("doctorId", "==", user.uid),
          where("status", "==", "in_session")
        );
        unsubMine = onSnapshot(mineQuery, (snapshot) => {
          setMyAppointments(snapshot.docs.map((d) => d.data()));
        });
      })
      .catch((err) => {
        console.error("[DoctorDashboard] Could not start realtime session:", err);
        setListenerError("Live updates are unavailable — showing last-loaded data.");
        api
          .get("/appointments/mine")
          .then(({ data }) => setMyAppointments(data.appointments.filter((a) => a.status === "in_session")))
          .catch(() => {});
        fetchAvailableFallback();
      });

    // REST fallback for the incoming queue when the real-time Firestore
    // listener can't be used at all — without this, a doctor whose
    // real-time session fails would see a permanently empty queue with no
    // way to recover short of a manual "Retry" action below.
    function fetchAvailableFallback() {
      api
        .get("/appointments/available")
        .then(({ data }) => setIncoming(data.appointments))
        .catch(() => {})
        .finally(() => setLoading(false));
    }

    return () => {
      unsubIncoming();
      unsubMine();
    };
  }, [user?.uid]);

  // Hide anything this doctor has already passed on, without needing an
  // extra Firestore index for a compound "not-array-contains" query.
  const visibleIncoming = useMemo(
    () => incoming.filter((a) => !(a.passedBy || []).includes(user.uid)),
    [incoming, user.uid]
  );

  // "Claim Consultation" — claims the booking AND immediately launches the
  // built-in video call, per the workflow (claiming IS joining).
  const claimAndLaunch = async (appointmentId) => {
    setClaimingId(appointmentId);
    setClaimError("");
    try {
      await api.post(`/appointments/${appointmentId}/accept`);
      navigate(`/call/${appointmentId}`);
    } catch (err) {
      setClaimError(err.response?.data?.message || "Could not claim this request — it may already be claimed.");
      setClaimingId(null);
    }
  };

  const passRequest = async (appointmentId) => {
    try {
      await api.post(`/appointments/${appointmentId}/pass`);
    } catch (err) {
      console.error(err);
    }
  };

  const openNoteModal = (appointment) => {
    setNoteModal(appointment);
    setNoteText("");
  };

  const submitNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      await api.post(`/users/appointments/${noteModal.id}/notes`, { note: noteText });
      setNoteModal(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingNote(false);
    }
  };

  const markCompleted = async (id) => {
    try {
      await api.patch(`/appointments/${id}/status`, { status: "completed" });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-navy">Dr. {user.fullName}</h1>
      <p className="mt-1 text-sm text-slate-500">Live incoming requests and your active consultations.</p>
      {listenerError && <p className="mt-2 text-xs font-medium text-amber-600">{listenerError}</p>}
      {claimError && <p className="mt-2 text-xs font-medium text-red-600">{claimError}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Incoming queue */}
        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-navy">Incoming Requests</h2>
            <span className="badge-pending badge">{visibleIncoming.length} waiting</span>
          </div>
          <p className="text-xs text-slate-400">Admin-authorized requests available for any doctor to claim.</p>

          <div className="mt-4 space-y-3">
            {loading && <Spinner size="sm" label="Loading queue…" />}
            {!loading && visibleIncoming.length === 0 && (
              <p className="text-sm text-slate-400">No requests waiting right now.</p>
            )}
            {visibleIncoming.map((appt) => (
              <div key={appt.id} className="rounded-lg border border-slate-200 px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-navy">{appt.serviceName}</p>
                    <p className="text-xs text-slate-400">
                      {appt.humanId} • {appt.patientName} •{" "}
                      <span className="capitalize">{appt.consultationType}</span>
                    </p>
                  </div>
                  <StatusBadge status="awaiting_doctor_claim" />
                </div>
                {appt.chiefComplaint && <p className="mt-2 text-xs text-slate-500">"{appt.chiefComplaint}"</p>}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => claimAndLaunch(appt.id)}
                    disabled={claimingId === appt.id}
                    className="btn-primary !px-3 !py-1.5 !text-xs"
                  >
                    {claimingId === appt.id ? "Claiming…" : "Claim Consultation"}
                  </button>
                  <button onClick={() => passRequest(appt.id)} className="btn-secondary !px-3 !py-1.5 !text-xs">
                    Pass
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* My active consultations */}
        <section className="card">
          <h2 className="text-base font-semibold text-navy">My Active Consultations ({myAppointments.length})</h2>
          <p className="text-xs text-slate-400">In session — rejoin video, add notes, or mark completed.</p>

          <div className="mt-4 space-y-3">
            {!loading && myAppointments.length === 0 && (
              <p className="text-sm text-slate-400">Nothing active yet — claim a request to get started.</p>
            )}
            {myAppointments.map((appt) => (
              <div key={appt.id} className="rounded-lg border border-slate-200 px-3.5 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-navy">{appt.patientName}</p>
                    <p className="text-xs text-slate-400">{appt.serviceName} • {appt.humanId}</p>
                  </div>
                  <StatusBadge status={appt.status} />
                </div>
                {appt.chiefComplaint && <p className="mt-2 text-xs text-slate-500">"{appt.chiefComplaint}"</p>}
                {appt.consultationPin && (
                  <p className="mt-2 text-xs text-slate-400">
                    Access PIN: <span className="font-mono font-semibold text-navy">{appt.consultationPin}</span>
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => navigate(`/call/${appt.id}`)} className="btn-primary !px-3 !py-1.5 !text-xs">
                    Rejoin video
                  </button>
                  <button onClick={() => openNoteModal(appt)} className="btn-secondary !px-3 !py-1.5 !text-xs">
                    Add note
                  </button>
                  <button onClick={() => markCompleted(appt.id)} className="btn-secondary !px-3 !py-1.5 !text-xs">
                    Mark completed
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {noteModal && (
        <div className="modal-backdrop">
          <div className="modal-panel w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-navy">Note for {noteModal.patientName}</h3>
            <form onSubmit={submitNote} className="mt-4 space-y-4">
              <textarea
                className="input"
                rows={4}
                required
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Quick clinical note…"
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => setNoteModal(null)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={savingNote} className="btn-primary flex-1">
                  {savingNote ? "Saving…" : "Save note"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
