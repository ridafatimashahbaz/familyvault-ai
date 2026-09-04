import React from "react";
import Navbar from "./Navbar.jsx";

export default function AppLayout({ children }) {
  return (
    <div className="min-h-full flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
