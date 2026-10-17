import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ThemeProvider, themeBootstrapScript } from "@/components/theme-provider";
import { LocaleProvider } from "@/components/locale-provider";
import { getThemeChoice } from "@/lib/theme-server";
import { themeClassFor } from "@/lib/theme";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionary";

export const metadata: Metadata = {
  title: {
    default: "FamilyVault AI — your family's documents, organised and secure",
    template: "%s · FamilyVault AI",
  },
  description:
    "Upload CNICs, passports, certificates and bills. FamilyVault AI classifies them, reads the text with OCR, summarises each document and warns you before anything expires.",
  applicationName: "FamilyVault AI",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "FamilyVault",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1116" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [choice, locale] = await Promise.all([getThemeChoice(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <html
      lang={t.meta.htmlLang}
      dir={t.meta.dir}
      className={`h-full ${themeClassFor(choice)}`.trim()}
      suppressHydrationWarning
    >
      <head>
        <Script id="fv-theme-bootstrap" strategy="beforeInteractive">
          {themeBootstrapScript}
        </Script>
      </head>
      <body className="flex min-h-full flex-col antialiased">
        <LocaleProvider initialLocale={locale}>
          <ThemeProvider initialChoice={choice}>
            {children}
            <ServiceWorkerRegister />
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
