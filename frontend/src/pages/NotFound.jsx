import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-full flex flex-col items-center justify-center text-center px-4">
      <p className="text-brand-700 font-bold text-lg mb-2">FamilyVault AI</p>
      <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-slate-600">The page you're looking for doesn't exist.</p>
      <Link to="/" className="mt-6 text-brand-700 font-medium hover:underline">
        Back to home
      </Link>
    </div>
  );
}
