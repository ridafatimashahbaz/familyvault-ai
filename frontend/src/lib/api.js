import { supabase } from "./supabaseClient.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function authHeaders() {
  if (!supabase) throw new ApiError("App is not configured. Missing Supabase environment variables.", 503);
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new ApiError("You have been signed out. Please log in again.", 401);
  return { Authorization: `Bearer ${token}` };
}

async function handle(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON response — fall through with a generic message below
  }
  if (!res.ok) {
    throw new ApiError(body?.error || `Request failed (${res.status}).`, res.status);
  }
  return body;
}

export const api = {
  // ── Family members ──────────────────────────────────
  async listFamily() {
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/api/family`, { headers });
    return handle(res);
  },
  async addFamilyMember(payload) {
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/api/family`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return handle(res);
  },
  async deleteFamilyMember(id) {
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/api/family/${id}`, { method: "DELETE", headers });
    return handle(res);
  },

  // ── Documents ────────────────────────────────────────
  async listDocuments(params = {}) {
    const headers = await authHeaders();
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v)));
    const res = await fetch(`${API_URL}/api/documents?${qs.toString()}`, { headers });
    return handle(res);
  },
  async getDocumentUrl(id) {
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/api/documents/${id}/url`, { headers });
    return handle(res);
  },
  async uploadDocument(formData) {
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/api/documents`, { method: "POST", headers, body: formData });
    return handle(res);
  },
  async analyzeDocument(id) {
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/api/documents/${id}/analyze`, { method: "POST", headers });
    return handle(res);
  },
  async deleteDocument(id) {
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/api/documents/${id}`, { method: "DELETE", headers });
    return handle(res);
  },

  // ── AI Assistant ─────────────────────────────────────
  async askAssistant(question) {
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/api/ai/ask`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    return handle(res);
  },
  async aiStatus() {
    const res = await fetch(`${API_URL}/api/ai/status`);
    return handle(res);
  },

  // ── Demo data ────────────────────────────────────────
  async seedDemoData() {
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/api/demo/seed`, { method: "POST", headers });
    return handle(res);
  },
};

export { ApiError };
