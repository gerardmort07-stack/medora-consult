import { useEffect, useState } from "react";
import api from "../lib/api";
import StatusBadge from "../components/StatusBadge";
import Spinner from "../components/Spinner";

const TABS = ["Overview", "Payment Authorization", "Services", "Doctors", "Users", "Appointments"];

function formatGHS(kobo) {
  return `GH₵ ${(kobo / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState("");

  const [serviceModal, setServiceModal] = useState(null); // null | "new" | service object
  const [serviceForm, setServiceForm] = useState({ name: "", description: "", priceGhs: "" });
  const [savingService, setSavingService] = useState(false);
  const [serviceError, setServiceError] = useState("");
  const [authorizingId, setAuthorizingId] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, appointmentsRes, servicesRes] = await Promise.all([
        api.get("/users/stats"),
        api.get("/users"),
        api.get("/appointments"),
        api.get("/services/all"),
      ]);
      setStats(statsRes.data.stats);
      setUsers(usersRes.data.users);
      setAppointments(appointmentsRes.data.appointments);
      setServices(servicesRes.data.services);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const resetAppointmentPin = async (appointmentId) => {
    setActionError("");
    try {
      await api.post(`/appointments/${appointmentId}/reset-pin`);
      loadAll();
    } catch (err) {
      setActionError(err.response?.data?.message || "Could not reset PIN.");
    }
  };

  const authorizePayment = async (appointmentId) => {
    setActionError("");
    setAuthorizingId(appointmentId);
    try {
      await api.post(`/appointments/${appointmentId}/authorize-payment`);
      loadAll();
    } catch (err) {
      setActionError(err.response?.data?.message || "Could not authorize this payment.");
    } finally {
      setAuthorizingId(null);
    }
  };

  const setUserStatus = async (uid, status) => {
    setActionError("");
    try {
      await api.patch(`/users/${uid}/approve`, { status });
      loadAll();
    } catch (err) {
      setActionError(err.response?.data?.message || "Action failed.");
    }
  };

  const openNewService = () => {
    setServiceForm({ name: "", description: "", priceGhs: "" });
    setServiceError("");
    setServiceModal("new");
  };

  const openEditService = (service) => {
    setServiceForm({
      name: service.name,
      description: service.description || "",
      priceGhs: (service.priceKobo / 100).toString(),
    });
    setServiceError("");
    setServiceModal(service);
  };

  const submitServiceForm = async (e) => {
    e.preventDefault();
    setServiceError("");

    const priceKobo = Math.round(parseFloat(serviceForm.priceGhs) * 100);
    if (!serviceForm.name.trim() || !Number.isFinite(priceKobo) || priceKobo <= 0) {
      setServiceError("Please provide a valid name and a price greater than zero.");
      return;
    }

    setSavingService(true);
    try {
      if (serviceModal === "new") {
        await api.post("/services", { name: serviceForm.name, description: serviceForm.description, priceKobo });
      } else {
        await api.patch(`/services/${serviceModal.id}`, {
          name: serviceForm.name,
          description: serviceForm.description,
          priceKobo,
        });
      }
      setServiceModal(null);
      loadAll();
    } catch (err) {
      setServiceError(err.response?.data?.message || "Could not save this service.");
    } finally {
      setSavingService(false);
    }
  };

  const toggleServiceStatus = async (service) => {
    try {
      await api.patch(`/services/${service.id}`, { isActive: !service.isActive });
      loadAll();
    } catch (err) {
      console.error(err);
    }
  };

  const deleteService = async (service) => {
    try {
      await api.delete(`/services/${service.id}`);
      loadAll();
    } catch (err) {
      setActionError(err.response?.data?.message || "Could not delete this service.");
    }
  };

  const doctors = users.filter((u) => u.role === "doctor");
  const pendingDoctors = doctors.filter((d) => d.status === "pending");
  const pendingPayments = appointments.filter((a) => a.status === "pending_payment_verification");

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-navy">Admin Console</h1>
      <p className="mt-1 text-sm text-slate-500">
        System overview, MoMo payment authorization, services, doctor approvals, and booking logs.
      </p>

      <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === tab ? "border-teal text-teal-dark" : "border-transparent text-slate-500 hover:text-navy"
            }`}
          >
            {tab}
            {tab === "Doctors" && pendingDoctors.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                {pendingDoctors.length} pending
              </span>
            )}
            {tab === "Payment Authorization" && pendingPayments.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                {pendingPayments.length} waiting
              </span>
            )}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="mt-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{actionError}</div>
      )}

      {loading ? (
        <Spinner label="Loading admin console…" />
      ) : (
        <div className="mt-8">
          {activeTab === "Overview" && stats && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Users" value={stats.totalUsers} />
              <StatCard label="Doctors" value={stats.totalDoctors} sub={`${stats.pendingDoctors} pending approval`} />
              <StatCard label="Total Bookings" value={stats.totalAppointments} />
              <StatCard label="Awaiting Payment Verification" value={stats.pendingPaymentVerification} />
              <StatCard label="Awaiting Doctor Claim" value={stats.awaitingDoctorClaim} />
              <StatCard label="In Session" value={stats.inSessionAppointments} />
              <StatCard label="Completed" value={stats.completedAppointments} />
              <StatCard label="Total Revenue" value={formatGHS(stats.totalRevenueKobo)} />
              <StatCard label="Average Rating" value={stats.averageRating ? `${stats.averageRating} ★` : "—"} />
            </div>
          )}

          {activeTab === "Payment Authorization" && (
            <div>
              <p className="mb-4 text-sm text-slate-500">
                Check your MoMo SMS for each incoming payment, then authorize it to notify the patient and
                open it to the doctor queue.
              </p>
              {pendingPayments.length === 0 ? (
                <p className="text-sm text-slate-400">No payments waiting for verification.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {pendingPayments.map((appt) => (
                    <div key={appt.id} className="card">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-navy">{appt.patientName}</p>
                          <p className="text-xs text-slate-400">{appt.humanId} • {appt.serviceName}</p>
                        </div>
                        <StatusBadge status={appt.status} />
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-slate-500">
                        <p>Phone: <span className="font-medium text-navy">{appt.patientPhone}</span></p>
                        <p>Amount: <span className="font-medium text-navy">{formatGHS(appt.priceKobo)}</span></p>
                      </div>
                      <button
                        onClick={() => authorizePayment(appt.id)}
                        disabled={authorizingId === appt.id}
                        className="btn-primary mt-4 w-full !text-xs"
                      >
                        {authorizingId === appt.id ? "Authorizing…" : "Authorize Payment"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "Services" && (
            <div>
              <div className="mb-4 flex justify-end">
                <button onClick={openNewService} className="btn-primary">
                  + Add service
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Service</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {services.map((service) => (
                      <tr key={service.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-navy">{service.name}</p>
                          {service.description && <p className="text-xs text-slate-400">{service.description}</p>}
                        </td>
                        <td className="px-4 py-3 font-semibold text-teal-dark">{formatGHS(service.priceKobo)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={service.isActive ? "active" : "suspended"} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => openEditService(service)} className="btn-secondary !px-3 !py-1.5 !text-xs">
                              Edit
                            </button>
                            <button onClick={() => toggleServiceStatus(service)} className="btn-secondary !px-3 !py-1.5 !text-xs">
                              {service.isActive ? "Disable" : "Enable"}
                            </button>
                            <button
                              onClick={() => deleteService(service)}
                              className="btn-secondary !border-red-200 !px-3 !py-1.5 !text-xs !text-red-600 hover:!bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "Doctors" && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {doctors.map((doc) => (
                    <tr key={doc.uid}>
                      <td className="px-4 py-3 font-medium text-navy">{doc.humanId}</td>
                      <td className="px-4 py-3">{doc.fullName}</td>
                      <td className="px-4 py-3 text-slate-500">{doc.email}</td>
                      <td className="px-4 py-3"><StatusBadge status={doc.status} /></td>
                      <td className="px-4 py-3">
                        {doc.status === "pending" ? (
                          <button onClick={() => setUserStatus(doc.uid, "active")} className="btn-primary !px-3 !py-1.5 !text-xs">
                            Approve
                          </button>
                        ) : doc.status === "active" ? (
                          <button onClick={() => setUserStatus(doc.uid, "suspended")} className="btn-secondary !px-3 !py-1.5 !text-xs">
                            Suspend
                          </button>
                        ) : (
                          <button onClick={() => setUserStatus(doc.uid, "active")} className="btn-primary !px-3 !py-1.5 !text-xs">
                            Reactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "Users" && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.uid}>
                      <td className="px-4 py-3 font-medium text-navy">{u.humanId}</td>
                      <td className="px-4 py-3">{u.fullName}</td>
                      <td className="px-4 py-3 capitalize text-slate-500">{u.role}</td>
                      <td className="px-4 py-3 text-slate-500">{u.email}</td>
                      <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "Appointments" && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Doctor</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Rating</th>
                    <th className="px-4 py-3">Access PIN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {appointments.map((appt) => (
                    <tr key={appt.id}>
                      <td className="px-4 py-3 font-medium text-navy">{appt.humanId}</td>
                      <td className="px-4 py-3">
                        {appt.patientName}
                        <div className="text-xs text-slate-400">{appt.patientPhone}</div>
                      </td>
                      <td className="px-4 py-3">{appt.serviceName}</td>
                      <td className="px-4 py-3">{appt.doctorName || "Unclaimed"}</td>
                      <td className="px-4 py-3"><StatusBadge status={appt.paymentStatus} /></td>
                      <td className="px-4 py-3"><StatusBadge status={appt.status} /></td>
                      <td className="px-4 py-3">{appt.rating ? `${appt.rating} ★` : "—"}</td>
                      <td className="px-4 py-3">
                        {appt.consultationPin ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-navy">{appt.consultationPin}</span>
                            <StatusBadge status={appt.pinStatus} />
                            {appt.pinStatus === "locked" && (
                              <button
                                onClick={() => resetAppointmentPin(appt.id)}
                                className="btn-secondary !px-2 !py-1 !text-xs"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {serviceModal && (
        <div className="modal-backdrop">
          <div className="modal-panel w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-navy">
              {serviceModal === "new" ? "Add a new service" : `Edit ${serviceModal.name}`}
            </h3>
            <form onSubmit={submitServiceForm} className="mt-4 space-y-4">
              {serviceError && <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{serviceError}</div>}

              <div>
                <label className="label">Service name</label>
                <input
                  className="input"
                  required
                  value={serviceForm.name}
                  onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Description (optional)</label>
                <textarea
                  className="input"
                  rows={2}
                  value={serviceForm.description}
                  onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Price (GH₵)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className="input"
                  value={serviceForm.priceGhs}
                  onChange={(e) => setServiceForm({ ...serviceForm, priceGhs: e.target.value })}
                />
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setServiceModal(null)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={savingService} className="btn-primary flex-1">
                  {savingService ? "Saving…" : "Save service"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="card">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-navy">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
