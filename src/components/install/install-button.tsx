"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckCircle2, Download } from "lucide-react";

import { Button } from "@/components/ui/button";

/** The non-standard event Chrome/Edge fire when the app becomes installable. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Whether the page is running as an installed app rather than a browser tab. */
function subscribeDisplayMode(callback: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getDisplayStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches;
}

/**
 * One-tap install where the browser supports it.
 *
 * Chromium browsers fire `beforeinstallprompt`; we hold the event and reveal a
 * button that opens the native install dialog. Safari (iOS especially) never
 * fires it, so this renders nothing there and the page's manual steps take
 * over. Already-installed devices see a quiet confirmation instead.
 */
export function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [appInstalled, setAppInstalled] = useState(false);

  const displayStandalone = useSyncExternalStore(subscribeDisplayMode, getDisplayStandalone, () => false);
  const installed = appInstalled || displayStandalone;

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setAppInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <p className="inline-flex items-center gap-2 text-sm font-medium text-accent-strong">
        <CheckCircle2 className="size-4.5" aria-hidden="true" />
        This app is already installed on this device.
      </p>
    );
  }

  if (!promptEvent) return null;

  return (
    <Button
      size="lg"
      icon={<Download className="size-4.5" aria-hidden="true" />}
      onClick={async () => {
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        if (outcome === "accepted") setAppInstalled(true);
        setPromptEvent(null);
      }}
    >
      Install now
    </Button>
  );
}
