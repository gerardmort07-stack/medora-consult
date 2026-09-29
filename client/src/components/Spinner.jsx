export default function Spinner({ size = "md", label }) {
  const sizeClass = { sm: "h-4 w-4 border-2", md: "h-8 w-8 border-4", lg: "h-12 w-12 border-4" }[size];

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-slate-400">
      <div className={`${sizeClass} animate-spin rounded-full border-teal/30 border-t-teal`} />
      {label && <p className="text-xs font-medium">{label}</p>}
    </div>
  );
}
