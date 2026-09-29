export default function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-navy text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2">
              <img src="/logo.jpeg" alt="Medora logo" className="h-8 w-8 rounded object-contain" />
              <span className="text-base font-bold text-white">MEDORA Consult</span>
            </div>
            <p className="mt-3 text-sm text-slate-400">
              Executive-grade online medical consultations, from doctor booking to secure video visits.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Platform</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="/book" className="hover:text-teal-light">Book a consultation</a></li>
              <li><a href="/access" className="hover:text-teal-light">Track my booking</a></li>
              <li><a href="/login" className="hover:text-teal-light">Doctor / Admin login</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Contact</h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-400">
              <li>support@medora.com</li>
              <li>Sunyani, Ghana</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 rounded-lg border border-teal/30 bg-navy-light px-4 py-3.5">
          <p className="text-xs leading-relaxed text-slate-300">
            <span className="font-semibold text-teal-light">Medical Disclaimer:</span> Medora Consult
            provides online medical consultations and advisory services only. It is not a replacement for
            physical hospital visits or emergency medical care. In case of a medical emergency, please visit
            the nearest hospital immediately.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Medora Consult. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
