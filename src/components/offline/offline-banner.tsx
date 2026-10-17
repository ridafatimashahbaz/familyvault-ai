"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useLocale } from "@/components/locale-provider";
import { hasSnapshot, refreshSnapshot } from "@/lib/offline/secure-store";
import { Alert } from "@/components/ui/alert";

/**
 * Shown inside the signed-in shell. It reports when the connection drops, and
 * while the connection is up it quietly refreshes the encrypted offline snapshot
 * if the user has opted in — so the saved dates never go stale.
 */
export function OfflineBanner() {
  const { t } = useLocale();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();

    const sync = async () => {
      if (navigator.onLine && (await hasSnapshot())) await refreshSnapshot();
    };
    void sync();

    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("online", sync);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("online", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <Alert
      tone="warning"
      title={t.offline.bannerOffline}
      action={
        <Link href="/offline" className="text-sm font-semibold underline underline-offset-2">
          {t.offline.viewSnapshot}
        </Link>
      }
    />
  );
}
