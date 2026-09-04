import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { statusBadgeClasses } from "../lib/statusBadge.js";

function StatCard({ label, value }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const [documents, setDocuments] = useState(null);
  const [familyMembers, setFamilyMembers] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [docsRes, famRes] = await Promise.all([api.listDocuments(), api.listFamily()]);
        if (cancelled) return;
        setDocuments(docsRes.documents);
        setFamilyMembers(famRes.familyMembers);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load your dashboard.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>;
  }

  if (!documents || !familyMembers) {
    return <div className="text-slate-500 text-sm">Loading dashboard…</div>;
  }

  const expiringSoon = documents.filter((d) => d.expiry_status === "Expiring Soon" || d.expiry_status === "Expired");
  const recentlyAdded = documents.filter((d) => {
    const created = new Date(d.created_at);
    return (Date.now() - created.getTime()) / 86400000 <= 7;
  });
  const recent = [...documents]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 6);

  return (
    <div>
      {documents.length === 0 && (
        <div className="mb-6 p-4 rounded-lg bg-brand-50 border border-brand-100 text-brand-800 text-sm flex items-center justify-between gap-4">
          <span>You don't have any documents yet. Upload your first one, or load demo data to see how it works.</span>
          <Link to="/documents" className="shrink-0 font-medium underline">
            Go to Documents
          </Link>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Documents" value={documents.length} />
        <StatCard label="Expiring Soon" value={expiringSoon.length} />
        <StatCard label="Family Members" value={familyMembers.length} />
        <StatCard label="Recently Added" value={recentlyAdded.length} />
      </div>

      <div className="mt-8 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Recent Documents</h2>
            <Link to="/documents" className="text-sm text-brand-700 hover:underline">
              View all
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No documents yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recent.map((doc) => (
                <div key={doc.id} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{doc.name}</p>
                    <p className="text-xs text-slate-500">
                      {doc.category} · {familyMembers.find((f) => f.id === doc.family_member_id)?.name || "Unassigned"} ·{" "}
                      {new Date(doc.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full border ${statusBadgeClasses(doc.expiry_status)}`}>
                    {doc.expiry_status === "none" ? "No expiry" : doc.expiry_status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900">Expiry Alerts</h2>
          </div>
          {expiringSoon.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Nothing expiring soon. You're all set.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {expiringSoon.map((doc) => (
                <div key={doc.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-slate-900">{doc.name}</p>
                  <p className={`text-xs mt-0.5 ${doc.expiry_status === "Expired" ? "text-red-600" : "text-amber-600"}`}>
                    {doc.expiry_status === "Expired"
                      ? `Expired ${Math.abs(doc.days_until_expiry)} day(s) ago.`
                      : `Expires in ${doc.days_until_expiry} day(s).`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
