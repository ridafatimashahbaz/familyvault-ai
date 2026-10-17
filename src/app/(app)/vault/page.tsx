import { Vault } from "lucide-react";

import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui/page-header";
import { VaultPanel } from "@/components/vault/vault-panel";

export const metadata = { title: "Private vault" };

/**
 * The browser-side vault screen (Phase 1, Day 2).
 *
 * It is a signed-in screen with no server data of its own: everything on it is
 * driven by the client, because the key that reads these files only exists in the
 * browser. Nothing is fetched here apart from the session check.
 */
export default async function VaultPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Private vault"
        description="Files you keep here are scrambled on your device first, so this server stores them without ever being able to read them."
        icon={Vault}
      />
      <VaultPanel />
    </>
  );
}
