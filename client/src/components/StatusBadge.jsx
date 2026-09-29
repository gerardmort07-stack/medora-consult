const STYLES = {
  pending: "badge-pending", // doctor-account approval status ("pending admin approval")
  pending_payment_verification: "badge-pending",
  awaiting_doctor_claim: "badge-pending",
  in_session: "badge-inconsultation",
  completed: "badge-completed",
  cancelled: "badge-cancelled",
  active: "badge-active",
  suspended: "badge-cancelled",
  paid: "badge-active",
  unpaid: "badge-pending",
  locked: "badge-cancelled", // PIN locked after too many failed access attempts
};

const LABELS = {
  pending: "Pending",
  pending_payment_verification: "Verifying Payment",
  awaiting_doctor_claim: "Awaiting Doctor",
  in_session: "In Session",
  completed: "Completed",
  cancelled: "Cancelled",
  active: "Active",
  suspended: "Suspended",
  paid: "Paid",
  unpaid: "Unpaid",
  locked: "PIN Locked",
};

export default function StatusBadge({ status }) {
  const className = STYLES[status] || "badge bg-slate-100 text-slate-700";
  const label = LABELS[status] || status;
  return <span className={className}>{label}</span>;
}
