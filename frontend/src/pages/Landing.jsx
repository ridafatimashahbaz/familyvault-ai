import React from "react";
import { Link } from "react-router-dom";

const FEATURES = [
  {
    title: "One upload, fully organized",
    body: "Drop in a CNIC, passport, certificate or medical record — it's filed under the right category and family member automatically.",
  },
  {
    title: "AI reads it for you",
    body: "Get a plain-language summary, the key fields extracted, and the expiry date pulled out — no manual data entry.",
  },
  {
    title: "Never miss a renewal",
    body: "The dashboard flags anything expiring soon, so passports, insurance and IDs get renewed before they lapse.",
  },
  {
    title: "Ask instead of searching",
    body: "\"When does my father's passport expire?\" — the assistant answers from your own documents, nothing else.",
  },
];

const CATEGORIES = [
  "CNIC / ID Card",
  "Passport",
  "Birth Certificate",
  "Educational Certificate",
  "Medical Document",
  "Property Document",
  "Insurance Document",
];

export default function Landing() {
  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <span className="font-bold text-lg text-brand-700">FamilyVault AI</span>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Log in
            </Link>
            <Link
              to="/signup"
              className="text-sm font-medium bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-20 pb-16 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
          One secure place for your family's important documents.
        </h1>
        <p className="mt-5 text-lg text-slate-600 max-w-2xl mx-auto">
          Passports, CNICs, certificates and medical records live scattered across drawers, phones and email
          attachments — until the one time you need them urgently. FamilyVault AI keeps them together, reads
          them for you, and tells you before they expire.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to="/signup"
            className="bg-brand-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-brand-700 transition-colors"
          >
            Get Started
          </Link>
          <Link
            to="/login"
            className="px-6 py-3 rounded-lg font-medium border border-slate-300 hover:bg-slate-100 transition-colors"
          >
            I already have an account
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid sm:grid-cols-2 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="p-6 rounded-xl border border-slate-200 bg-white">
              <h3 className="font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-xl font-semibold text-slate-900 text-center">Built for the documents that matter</h2>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {CATEGORIES.map((c) => (
            <span key={c} className="px-3 py-1.5 rounded-full text-sm bg-brand-50 text-brand-700 border border-brand-100">
              {c}
            </span>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        FamilyVault AI — built for a hackathon demo.
      </footer>
    </div>
  );
}
