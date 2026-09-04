import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";

export default function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState("");
  const [seedError, setSeedError] = useState("");

  async function handleSeed() {
    setSeeding(true);
    setSeedMessage("");
    setSeedError("");
    try {
      const res = await api.seedDemoData();
      setSeedMessage(res.message);
    } catch (err) {
      setSeedError(err.message || "Failed to load demo data.");
    } finally {
      setSeeding(false);
    }
  }

  async function handleLogout() {
    await signOut();
    navigate("/login");
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-slate-900">Settings</h1>

      <div className="mt-4 bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-medium text-slate-900">Account</h2>
        <p className="mt-1 text-sm text-slate-600">{user?.email}</p>
        <button onClick={handleLogout} className="mt-4 text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100">
          Log out
        </button>
      </div>

      <div className="mt-4 bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-medium text-slate-900">Demo data</h2>
        <p className="mt-1 text-sm text-slate-600">
          Load a few sample family members and documents, clearly labeled "Demo", to see the app populated. Skipped
          automatically if you already have data.
        </p>
        <button
          onClick={handleSeed}
          disabled={seeding}
          className="mt-4 text-sm px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {seeding ? "Loading…" : "Load demo data"}
        </button>
        {seedMessage && <p className="mt-2 text-sm text-green-700">{seedMessage}</p>}
        {seedError && <p className="mt-2 text-sm text-red-600">{seedError}</p>}
      </div>
    </div>
  );
}
