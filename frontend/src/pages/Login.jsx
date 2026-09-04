import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { signIn, configured } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Login failed. Check your email and password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <Link to="/" className="block text-center font-bold text-lg text-brand-700 mb-8">
          FamilyVault AI
        </Link>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h1 className="text-lg font-semibold text-slate-900">Log in</h1>

          {!configured && (
            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              The app is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in{" "}
              <code>frontend/.env</code>.
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={busy || !configured}
              className="w-full bg-brand-600 text-white py-2.5 rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {busy ? "Logging in…" : "Log in"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-slate-600">
          Don't have an account?{" "}
          <Link to="/signup" className="font-medium text-brand-700 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
