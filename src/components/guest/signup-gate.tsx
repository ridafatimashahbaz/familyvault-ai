"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Lock, ShieldCheck, X } from "lucide-react";

import { IconButton, buttonClass } from "@/components/ui/button";

/**
 * Guest mode.
 *
 * A visitor can browse the sample vault without an account, but anything that
 * *writes* data (uploading, adding a family member, saving an edit, asking the
 * assistant) is intercepted here and turned into an invitation to sign up.
 */

type PromptFn = (message?: string) => void;

const SignupContext = createContext<PromptFn>(() => {});

export function useSignupPrompt(): PromptFn {
  return useContext(SignupContext);
}

const DEFAULT_MESSAGE =
  "Exploring is free — but this sample vault is read-only. Create an account to upload your own documents and keep everything in your own profile.";

export function GuestProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  const open = useCallback<PromptFn>((custom) => {
    setMessage(custom ?? DEFAULT_MESSAGE);
  }, []);

  return (
    <SignupContext.Provider value={open}>
      {children}
      <SignupDialog message={message} onClose={() => setMessage(null)} />
    </SignupContext.Provider>
  );
}

function SignupDialog({ message, onClose }: { message: string | null; onClose: () => void }) {
  const open = message !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/45"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signup-gate-title"
        className="animate-fade-up relative w-full max-w-md rounded-card border border-ink-200 bg-surface p-5 shadow-raised sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-accent ring-1 ring-brand-100">
            <Lock className="size-5" aria-hidden="true" />
          </span>
          <IconButton label="Close" onClick={onClose} className="-mr-1 -mt-1">
            <X className="size-4.5" aria-hidden="true" />
          </IconButton>
        </div>

        <h2 id="signup-gate-title" className="mt-3.5 text-lg font-semibold text-ink-950">
          Create your own vault
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{message}</p>

        <ul className="mt-4 space-y-2 text-sm text-ink-600">
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-accent" aria-hidden="true" />
            Documents are encrypted and stored in your own profile.
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-accent" aria-hidden="true" />
            Files are read and understood on your own server.
          </li>
        </ul>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/register"
            autoFocus
            className={buttonClass("primary", "md", "w-full sm:w-auto")}
          >
            Create free account
          </Link>
          <Link href="/login" className={buttonClass("secondary", "md", "w-full sm:w-auto")}>
            I already have one
          </Link>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full text-center text-xs font-medium text-ink-500 hover:text-ink-700"
        >
          Keep looking around
        </button>
      </div>
    </div>
  );
}
