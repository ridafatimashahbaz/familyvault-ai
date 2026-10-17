import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { SignOutButton } from "@/components/sign-out-button";
import { ToastProvider } from "@/components/toast";
import { Alert } from "@/components/ui/alert";
import { assertProductionSecrets } from "@/lib/env";
import { navItems } from "@/lib/nav";
import { encryptionStatus } from "@/lib/security/crypto";
import { countExpiring } from "@/lib/services/documents";
import { requireUser } from "@/lib/session";

/**
 * Gate for the whole signed-in area.
 *
 * There is no edge middleware in this app, so `requireUser()` here is what
 * keeps an unauthenticated request out of every page below. The reminder count
 * is read once per request and passed into the navigation model rather than
 * fetched again by the client.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const expiring = await countExpiring(user.id);

  return (
    <ToastProvider>
      <AppShell
        user={{ name: user.name, email: user.email }}
        nav={navItems(expiring)}
        banner={
          <>
            <ConfigurationBanner />
            <OfflineBanner />
          </>
        }
        footer={<SignOutButton />}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}

/**
 * Surfaced on every page rather than buried in settings: an unencrypted vault
 * or an unsigned session is the one thing a user must not discover later.
 */
function ConfigurationBanner() {
  const missing = assertProductionSecrets();

  if (missing.length > 0) {
    return (
      <Alert tone="danger" title="This app is not fully set up yet">
        <p>
          A required security setting is missing. Please ask the person who installed this app to
          finish the setup before storing anything important.
        </p>
      </Alert>
    );
  }

  if (encryptionStatus() === "plaintext") {
    return (
      <Alert tone="warning" title="This app is not fully set up yet">
        <p>
          Documents are not being encrypted yet. Please ask the person who installed this app to
          finish the security setup before storing anything important.
        </p>
      </Alert>
    );
  }

  return null;
}
