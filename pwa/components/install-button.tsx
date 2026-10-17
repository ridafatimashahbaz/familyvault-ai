"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * "Install on this device", shown only when the browser offers an install
 * prompt. Where it does not (most desktop browsers, iOS), the footer explains
 * the menu item instead, so nothing here depends on the button existing.
 */
export function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!prompt) return null;

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={() => {
        void prompt.prompt();
        setPrompt(null);
      }}
    >
      Install on this device
    </button>
  );
}
