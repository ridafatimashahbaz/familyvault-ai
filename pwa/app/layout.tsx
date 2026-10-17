import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { ServiceWorkerRegister } from "../components/service-worker-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "FamilyVault",
  description: "Your family's documents, scrambled on your device.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: ["/icons/icon-192.png", "/icons/icon-512.png", "/icon.svg"],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
