export default function DisclaimerBanner({ compact = false }) {
  return (
    <div
      className={`rounded-lg border border-amber-200 bg-amber-50 ${
        compact ? "px-3 py-2.5" : "px-4 py-3.5"
      }`}
    >
      <p className="text-xs leading-relaxed text-amber-900">
        <span className="font-semibold">Medical Disclaimer:</span> Medora Consult provides online
        medical consultations and advisory services only. It is not a replacement for physical hospital
        visits or emergency medical care. In case of a medical emergency, please visit the nearest hospital
        immediately.
      </p>
    </div>
  );
}
