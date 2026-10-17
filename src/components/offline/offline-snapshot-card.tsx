"use client";

import { useEffect, useState } from "react";
import { CloudDownload, HardDriveDownload, ShieldCheck, Trash2 } from "lucide-react";

import { formatDate } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  clearSnapshot,
  loadSnapshot,
  refreshSnapshot,
} from "@/lib/offline/secure-store";

/**
 * Opt-in control for the offline snapshot. Nothing is stored until the user
 * turns it on, and what is stored is encrypted on the device — this card is
 * where that promise is made visible.
 */
export function OfflineSnapshotCard() {
  const { t } = useLocale();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      // Deferred so nothing is set during the effect's synchronous body.
      await Promise.resolve();
      const canStore =
        typeof indexedDB !== "undefined" && typeof crypto !== "undefined" && !!crypto.subtle;
      if (!active) return;
      setSupported(canStore);
      if (!canStore) return;

      const snapshot = await loadSnapshot();
      if (!active) return;
      setEnabled(Boolean(snapshot));
      setSavedAt(snapshot?.generatedAt ?? null);
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const toggle = async () => {
    setBusy(true);
    setFailed(false);

    if (enabled) {
      await clearSnapshot();
      setEnabled(false);
      setSavedAt(null);
    } else {
      const ok = await refreshSnapshot();
      if (ok) {
        const snapshot = await loadSnapshot();
        setEnabled(true);
        setSavedAt(snapshot?.generatedAt ?? null);
      } else {
        setFailed(true);
      }
    }

    setBusy(false);
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title={t.offline.cardTitle}
        description={t.offline.cardDescription}
        icon={<HardDriveDownload className="size-4.5" aria-hidden="true" />}
        action={
          enabled ? (
            <Badge tone="success" icon={<ShieldCheck className="size-3" aria-hidden="true" />}>
              {t.offline.enabledLabel}
            </Badge>
          ) : (
            <Badge tone="neutral">{t.offline.disabledLabel}</Badge>
          )
        }
      />
      <CardBody className="space-y-4">
        {supported === false ? (
          <p className="text-sm text-ink-500">{t.offline.unavailable}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={enabled ? "secondary" : "primary"}
              onClick={toggle}
              disabled={busy || supported === null}
              loading={busy}
              icon={
                enabled ? (
                  <Trash2 className="size-4" aria-hidden="true" />
                ) : (
                  <CloudDownload className="size-4" aria-hidden="true" />
                )
              }
            >
              {busy ? t.offline.saving : enabled ? t.offline.disable : t.offline.enable}
            </Button>
            <span className="text-xs text-ink-500">
              {savedAt ? t.offline.updated.replace("{when}", formatDate(savedAt)) : t.offline.never}
            </span>
          </div>
        )}

        {failed ? <p className="text-sm text-danger-ink">{t.offline.saveFailed}</p> : null}

        <p className="text-xs leading-relaxed text-ink-500">{t.offline.privacyLine}</p>
      </CardBody>
    </Card>
  );
}
