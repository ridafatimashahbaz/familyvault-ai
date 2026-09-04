import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const links = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/documents", label: "Documents" },
  { to: "/family", label: "Family" },
  { to: "/assistant", label: "AI Assistant" },
  { to: "/settings", label: "Settings" },
];

export default function Navbar() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate("/login");
  }

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <div className="flex items-center gap-8">
          <span className="font-bold text-lg text-brand-700">FamilyVault AI</span>
          <div className="hidden md:flex gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-sm text-slate-500 truncate max-w-[160px]">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
      </div>
      <div className="md:hidden flex overflow-x-auto gap-1 px-4 pb-2">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
