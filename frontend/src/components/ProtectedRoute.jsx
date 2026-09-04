import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ children }) {
  const { user, loading, configured } = useAuth();

  if (!configured) {
    return (
      <div className="max-w-lg mx-auto mt-24 p-6 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
        The app is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
        in <code>frontend/.env</code> and restart the dev server.
      </div>
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-500">Loading…</div>;
  }

  if (!user) return <Navigate to="/login" replace />;

  return children;
}
