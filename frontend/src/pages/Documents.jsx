import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { statusBadgeClasses, analysisStatusLabel } from "../lib/statusBadge.js";

const CATEGORIES = [
  "CNIC / ID Card",
  "Passport",
  "Birth Certificate",
  "Educational Certificate",
  "Medical Document",
  "Property Document",
  "Insurance Document",
  "Other",
];

export default function Documents() {
  const [documents, setDocuments] = useState(null);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [familyMemberId, setFamilyMemberId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [analyzingId, setAnalyzingId] = useState(null);
  const [rowError, setRowError] = useState({});

  async function refresh(params = {}) {
    try {
      const res = await api.listDocuments(params);
      setDocuments(res.documents);
    } catch (err) {
      setError(err.message || "Failed to load documents.");
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const fam = await api.listFamily();
        setFamilyMembers(fam.familyMembers);
      } catch {
        // family list is non-critical here; upload form just shows "Unassigned"
      }
      await refresh();
    }
    init();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      refresh({ search, category: categoryFilter });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryFilter]);

  async function handleUpload(e) {
    e.preventDefault();
    setUploadError("");
    if (!file) {
      setUploadError("Please choose a file to upload.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name || file.name);
      formData.append("category", category);
      if (familyMemberId) formData.append("family_member_id", familyMemberId);

      await api.uploadDocument(formData);
      setFile(null);
      setName("");
      e.target.reset();
      await refresh({ search, category: categoryFilter });
    } catch (err) {
      setUploadError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleAnalyze(id) {
    setAnalyzingId(id);
    setRowError((s) => ({ ...s, [id]: "" }));
    try {
      const res = await api.analyzeDocument(id);
      if (!res.success) {
        setRowError((s) => ({ ...s, [id]: res.message }));
      }
      await refresh({ search, category: categoryFilter });
    } catch (err) {
      setRowError((s) => ({ ...s, [id]: err.message || "Analysis failed." }));
    } finally {
      setAnalyzingId(null);
    }
  }

  async function handleView(id) {
    try {
      const res = await api.getDocumentUrl(id);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setRowError((s) => ({ ...s, [id]: err.message || "Could not open file." }));
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this document? This cannot be undone.")) return;
    try {
      await api.deleteDocument(id);
      await refresh({ search, category: categoryFilter });
    } catch (err) {
      setRowError((s) => ({ ...s, [id]: err.message || "Delete failed." }));
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Documents</h1>

      <form onSubmit={handleUpload} className="mt-4 bg-white border border-slate-200 rounded-xl p-5 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">File (PDF, PNG, JPG, WEBP)</label>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Name (optional)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Uses file name if blank"
            className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Family Member</label>
          <select value={familyMemberId} onChange={(e) => setFamilyMemberId(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm">
            <option value="">Unassigned</option>
            {familyMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={uploading}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload document"}
          </button>
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
        </div>
      </form>

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by document name…"
          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"
        />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-4 space-y-3">
        {documents === null ? (
          <p className="text-sm text-slate-500">Loading documents…</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-slate-500">No documents match. Try a different search or upload one above.</p>
        ) : (
          documents.map((doc) => (
            <div key={doc.id} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{doc.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {doc.category} · {familyMembers.find((f) => f.id === doc.family_member_id)?.name || "Unassigned"} ·{" "}
                    {new Date(doc.created_at).toLocaleDateString()} · {analysisStatusLabel(doc.analysis_status)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {doc.expiry_status !== "none" && (
                    <span className={`text-xs font-medium px-2 py-1 rounded-full border ${statusBadgeClasses(doc.expiry_status)}`}>
                      {doc.expiry_status}
                    </span>
                  )}
                  {doc.is_demo && (
                    <span className="text-xs font-medium px-2 py-1 rounded-full border bg-slate-100 text-slate-600 border-slate-200">Demo</span>
                  )}
                </div>
              </div>

              {doc.summary && <p className="mt-3 text-sm text-slate-700">{doc.summary}</p>}

              {doc.extracted_data && Object.keys(doc.extracted_data).length > 0 && (
                <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  {Object.entries(doc.extracted_data).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="text-slate-500">{k}:</dt>
                      <dd className="text-slate-800 font-medium">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {rowError[doc.id] && <p className="mt-2 text-sm text-amber-700">{rowError[doc.id]}</p>}

              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                {doc.file_path && (
                  <button onClick={() => handleView(doc.id)} className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100">
                    View file
                  </button>
                )}
                {doc.file_path && (
                  <button
                    onClick={() => handleAnalyze(doc.id)}
                    disabled={analyzingId === doc.id}
                    className="px-3 py-1.5 rounded-lg border border-brand-200 text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                  >
                    {analyzingId === doc.id ? "Analyzing…" : "Analyze with AI"}
                  </button>
                )}
                <button onClick={() => handleDelete(doc.id)} className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
