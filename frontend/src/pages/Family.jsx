import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";

const RELATIONSHIPS = ["Self", "Father", "Mother", "Sister", "Brother", "Spouse", "Son", "Daughter", "Other"];

export default function Family() {
  const [members, setMembers] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState(RELATIONSHIPS[0]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  async function refresh() {
    try {
      const [famRes, docRes] = await Promise.all([api.listFamily(), api.listDocuments()]);
      setMembers(famRes.familyMembers);
      setDocuments(docRes.documents);
    } catch (err) {
      setError(err.message || "Failed to load family members.");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setAddError("");
    if (!name.trim()) {
      setAddError("Name is required.");
      return;
    }
    setAdding(true);
    try {
      await api.addFamilyMember({ name: name.trim(), relationship });
      setName("");
      await refresh();
    } catch (err) {
      setAddError(err.message || "Failed to add family member.");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Remove this family member? Their documents will become unassigned.")) return;
    try {
      await api.deleteFamilyMember(id);
      await refresh();
    } catch (err) {
      setError(err.message || "Failed to remove family member.");
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Family Members</h1>

      <form onSubmit={handleAdd} className="mt-4 bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Relationship</label>
          <select value={relationship} onChange={(e) => setRelationship(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={adding}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add family member"}
        </button>
        {addError && <p className="text-sm text-red-600 w-full">{addError}</p>}
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        {members === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-slate-500">No family members yet. Add one above.</p>
        ) : (
          members.map((m) => {
            const theirDocs = documents.filter((d) => d.family_member_id === m.id);
            return (
              <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{m.name}</p>
                    <p className="text-xs text-slate-500">{m.relationship}</p>
                  </div>
                  <button onClick={() => handleDelete(m.id)} className="text-xs text-red-600 hover:underline">
                    Remove
                  </button>
                </div>
                <p className="mt-3 text-xs font-medium text-slate-500">
                  {theirDocs.length} document{theirDocs.length === 1 ? "" : "s"}
                </p>
                {theirDocs.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {theirDocs.map((d) => (
                      <li key={d.id} className="text-sm text-slate-700 truncate">
                        {d.name} <span className="text-slate-400">· {d.category}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
