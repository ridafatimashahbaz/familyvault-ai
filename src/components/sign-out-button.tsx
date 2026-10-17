"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { signOutAction } from "@/lib/actions";
import { clearSnapshot } from "@/lib/offline/secure-store";

/**
 * Clears the encrypted offline snapshot before ending the session, so the next
 * person to use the device cannot read the previous user's saved dates. The
 * session itself is still cleared on the server by the action.
 */
export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  const handle = () => {
    startTransition(async () => {
      await clearSnapshot();
      await signOutAction();
    });
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
    >
      <LogOut className="size-4.5 shrink-0" aria-hidden="true" />
      Sign out
    </button>
  );
}
