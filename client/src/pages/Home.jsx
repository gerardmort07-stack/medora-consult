import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import DisclaimerBanner from "../components/DisclaimerBanner";

function formatGHS(kobo) {
  return `GH₵ ${(kobo / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export default function Home() {
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);

  useEffect(() => {
    api
      .get("/services")
      .then(({ data }) => setServices(data.services))
      .catch(() => setServices([]))
      .finally(() => setLoadingServices(false));
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="bg-navy">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <span className="inline-block rounded-full bg-teal/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-light">
              Telehealth, done right
            </span>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl">
              Medical consultations, <span className="text-teal-light">on your schedule.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-slate-300">
              Book a licensed doctor, pay securely, and join a private video consultation — all from one
              executive-grade platform.
            </p>
            <p className="mt-3 max-w-xl text-sm text-slate-400">
              No need to pick a doctor's schedule — submit your request and the next available doctor
              picks it up.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link to="/book" className="btn-primary !px-6 !py-3 !text-base">
                Book a consultation
              </Link>
              <Link to="/access" className="btn-secondary !border-white/20 !bg-transparent !px-6 !py-3 !text-base !text-white hover:!bg-white/10">
                Track my booking
              </Link>
            </div>
          </div>
          <div className="flex justify-center">
            <img src="/logo.jpeg" alt="Medora Consult" className="w-56 rounded-2xl bg-white p-6 shadow-2xl sm:w-72" />
          </div>
        </div>
      </section>

      {/* Services & pricing */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold text-navy sm:text-3xl">Our Services</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-500">
          Transparent pricing — pick a service, pay, and the next available doctor takes your case.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {loadingServices && (
            <p className="col-span-full text-center text-sm text-slate-400">Loading services…</p>
          )}
          {!loadingServices && services.length === 0 && (
            <p className="col-span-full text-center text-sm text-slate-400">
              Services will appear here once configured by an administrator.
            </p>
          )}
          {services.map((service) => (
            <div key={service.id} className="card">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-teal/10 text-teal-dark font-bold">
                +
              </div>
              <h3 className="text-base font-semibold text-navy">{service.name}</h3>
              {service.description && <p className="mt-2 text-sm text-slate-500">{service.description}</p>}
              <p className="mt-3 text-lg font-bold text-teal-dark">{formatGHS(service.priceKobo)}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link to="/book" className="btn-primary !px-6 !py-3">
            Book a service — no account needed
          </Link>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <DisclaimerBanner />
      </section>
    </div>
  );
}
