import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Patients never log in — this covers doctor and admin accounts only.
const DASHBOARD_PATH = { doctor: "/doctor", admin: "/admin" };

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/logo.jpeg" alt="Medora Consult logo" className="h-9 w-9 rounded object-contain" />
          <span className="text-lg font-extrabold tracking-tight text-navy">
            MEDORA <span className="font-medium text-teal-dark">Consult</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                to={DASHBOARD_PATH[user.role] || "/"}
                className="hidden text-sm font-semibold text-navy hover:text-teal-dark sm:inline"
              >
                Dashboard
              </Link>
              <span className="hidden text-sm text-slate-500 sm:inline">{user.fullName}</span>
              <button onClick={handleLogout} className="btn-secondary !px-4 !py-2">
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/access" className="hidden text-sm font-semibold text-navy hover:text-teal-dark sm:inline">
                Track My Booking
              </Link>
              <Link to="/book" className="btn-primary !px-4 !py-2">
                Book Consultation
              </Link>
              <Link to="/login" className="text-sm text-slate-400 hover:text-navy">
                Doctor/Admin
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
