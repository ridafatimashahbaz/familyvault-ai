import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

const SUGGESTIONS = [
  "What documents are expiring soon?",
  "Show me my mother's documents.",
  "When does my passport expire?",
  "Summarize my latest uploaded document.",
];

export default function Assistant() {
  const [aiConfigured, setAiConfigured] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    api
      .aiStatus()
      .then((res) => setAiConfigured(res.configured))
      .catch(() => setAiConfigured(true)); // don't block the UI on a status-check failure
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(question) {
    const q = (question ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await api.askAssistant(q);
      if (res.success) {
        setMessages((m) => [...m, { role: "assistant", text: res.answer }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", text: res.message, muted: true }]);
      }
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: err.message || "Something went wrong.", muted: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-h-[720px]">
      <h1 className="text-xl font-semibold text-slate-900">AI Assistant</h1>
      <p className="text-sm text-slate-500 mt-1">Answers only come from your own documents and family members.</p>

      {!aiConfigured && (
        <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          The AI Assistant is temporarily unavailable (no API key configured on the server).
        </div>
      )}

      <div className="mt-4 flex-1 bg-white border border-slate-200 rounded-xl overflow-y-auto p-5 space-y-4">
        {messages.length === 0 ? (
          <div>
            <p className="text-sm text-slate-500 mb-3">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-sm px-3 py-1.5 rounded-full border border-slate-300 hover:bg-slate-100"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`max-w-[85%] ${m.role === "user" ? "ml-auto text-right" : ""}`}>
              <div
                className={`inline-block px-4 py-2.5 rounded-2xl text-sm ${
                  m.role === "user"
                    ? "bg-brand-600 text-white"
                    : m.muted
                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))
        )}
        {busy && <div className="text-sm text-slate-400">Thinking…</div>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your documents…"
          disabled={!aiConfigured}
          className="flex-1 px-3 py-2.5 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50"
        />
        <button
          type="submit"
          disabled={busy || !aiConfigured}
          className="bg-brand-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
