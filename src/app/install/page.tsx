import { ArrowLeft, Laptop, Lock, Monitor, Plus, Share, Smartphone } from "lucide-react";

import { Logo } from "@/components/brand";
import { InstallButton } from "@/components/install/install-button";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export const metadata = {
  title: "Install the app",
  description:
    "Add FamilyVault AI to your phone, tablet or computer so it opens like a normal app — no app store needed.",
};

/** The four common routes to "installed", in the order most people need them. */
const DEVICES = [
  {
    id: "iphone",
    icon: Smartphone,
    title: "iPhone & iPad",
    subtitle: "Use Safari",
    steps: [
      "Open this site in Safari.",
      "Tap the Share button (the square with an arrow pointing up) in the toolbar.",
      "Scroll down and tap “Add to Home Screen”.",
      "Tap “Add”. The FamilyVault icon appears on your Home Screen.",
    ],
  },
  {
    id: "android",
    icon: Smartphone,
    title: "Android",
    subtitle: "Use Chrome",
    steps: [
      "Open this site in Chrome.",
      "Tap the ⋮ menu in the top-right corner.",
      "Tap “Install app” (or “Add to Home screen”).",
      "Confirm by tapping “Install”.",
    ],
  },
  {
    id: "desktop",
    icon: Monitor,
    title: "Windows, Linux & Mac",
    subtitle: "Use Chrome or Edge",
    steps: [
      "Open this site in Chrome or Edge.",
      "Click the install icon in the address bar (a small screen with a down-arrow).",
      "If you don’t see it, open the browser menu and choose “Install FamilyVault…”.",
      "Confirm “Install”. A normal app window opens and an icon is added to your desktop.",
    ],
  },
  {
    id: "mac-safari",
    icon: Laptop,
    title: "Mac",
    subtitle: "Use Safari",
    steps: [
      "Open this site in Safari.",
      "In the menu bar, open File.",
      "Choose “Add to Dock”.",
      "Confirm by clicking “Add”.",
    ],
  },
] as const;

export default function InstallPage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-ink-100">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <LinkButton
            href="/"
            variant="ghost"
            icon={<ArrowLeft className="size-4 flip-rtl" aria-hidden="true" />}
          >
            Back
          </LinkButton>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-2xl space-y-4">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-accent">
            <Plus className="size-3.5" aria-hidden="true" />
            Add it like an app
          </span>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl">
            Install FamilyVault AI on your device
          </h1>
          <p className="text-pretty text-base leading-relaxed text-ink-600">
            FamilyVault is a web app, so there is nothing to find in an app store and nothing extra
            to download. You add it to your phone, tablet or computer from the browser, and it then
            opens full-screen with its own icon — just like any other app.
          </p>
        </div>

        <div className="mt-8 flex min-h-8 items-center">
          <InstallButton />
        </div>

        <ul className="mt-8 grid gap-3 text-sm text-ink-600 sm:grid-cols-3">
          <li className="flex items-start gap-2">
            <Smartphone className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            Works on phones, tablets and computers.
          </li>
          <li className="flex items-start gap-2">
            <Share className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            No app store, no account on a third-party store.
          </li>
          <li className="flex items-start gap-2">
            <Lock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            Your documents stay encrypted and on your own server.
          </li>
        </ul>

        <section className="mt-12 space-y-5">
          <h2 className="text-lg font-semibold tracking-tight text-ink-950">
            Choose your device
          </h2>

          <div className="grid gap-5 md:grid-cols-2">
            {DEVICES.map((device) => (
              <Card key={device.id} as="article">
                <CardHeader
                  title={device.title}
                  description={device.subtitle}
                  icon={<device.icon className="size-4.5" aria-hidden="true" />}
                />
                <CardBody>
                  <ol className="space-y-2.5 text-sm leading-relaxed text-ink-700">
                    {device.steps.map((step, index) => (
                      <li key={step} className="flex gap-3">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[0.7rem] font-semibold text-accent ring-1 ring-brand-100">
                          {index + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-card border border-ink-200/80 bg-ink-50/60 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-ink-900">A few things worth knowing</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-600">
            <li>
              • On your first visit after installing, sign in as usual. The app remembers nothing on
              its own — your vault lives on your own server, not on the device.
            </li>
            <li>
              • If you have saved an offline copy of your reminders, you can open that even with no
              internet. Everything else needs a connection.
            </li>
            <li>
              • To remove it, delete the icon like any other app. Your documents are untouched on the
              server.
            </li>
            <li>
              • Some browsers do not support installing (for example Firefox). The app still works
              normally in a tab — you just won&apos;t get the home-screen icon.
            </li>
          </ul>
        </section>
      </main>

      <footer className="border-t border-ink-100">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 text-xs text-ink-500 sm:px-6">
          FamilyVault AI — add it once, use it from any of your devices.
        </div>
      </footer>
    </div>
  );
}
