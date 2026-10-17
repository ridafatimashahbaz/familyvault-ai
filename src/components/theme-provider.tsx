"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import {
  THEME_COOKIE,
  THEME_STORAGE_KEY,
  isThemeChoice,
  parseThemeChoice,
  resolveTheme,
  type ResolvedTheme,
  type ThemeChoice,
} from "@/lib/theme";

/**
 * Applies and persists the theme choice on the client.
 *
 * The server has already rendered the correct class from the cookie, so this
 * provider never causes a first-paint flash; it only reacts to user changes and
 * to the OS preference flipping while "system" is selected.
 */

type ThemeContextValue = {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  setChoice: (choice: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/* Subscribing to the media query through useSyncExternalStore keeps the OS
   preference in React state without a setState-in-effect round trip. */
function subscribeSystemTheme(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function readSystemTheme(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function serverSystemTheme(): boolean {
  return false;
}

function applyClass(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

function persist(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* private mode — the cookie below still carries the choice */
  }
  document.cookie = `${THEME_COOKIE}=${choice}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemeProvider({
  initialChoice,
  children,
}: {
  initialChoice: ThemeChoice;
  children: ReactNode;
}) {
  const [choice, setChoiceState] = useState<ThemeChoice>(initialChoice);
  const systemDark = useSyncExternalStore(subscribeSystemTheme, readSystemTheme, serverSystemTheme);

  const resolved = resolveTheme(choice, systemDark);

  useEffect(() => {
    applyClass(resolved);
  }, [resolved]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    persist(next);
  }, []);

  const value = useMemo(
    () => ({ choice, resolved, setChoice }),
    [choice, resolved, setChoice],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>.");
  return context;
}

/** Reads the stored choice before React runs, mirroring the server cookie. */
export function readStoredChoice(): ThemeChoice {
  try {
    const fromStorage = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeChoice(fromStorage)) return fromStorage;
  } catch {
    /* ignore */
  }
  return parseThemeChoice(document.cookie.match(/(?:^|;\s*)fv-theme=([^;]+)/)?.[1]);
}

/**
 * Blocking script placed in <head>: sets the class from the *client* store so
 * an OS-driven "system" theme never flashes light before hydration.
 */
export const themeBootstrapScript = `(function(){try{
var s=localStorage.getItem('${THEME_STORAGE_KEY}');
var c=s||(document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]+)/)||[])[1];
var d=c==='dark'||((!c||c==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);
var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';
}catch(e){}})();`;
