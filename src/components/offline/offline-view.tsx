"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, ShieldCheck, WifiOff } from "lucide-react";

import { formatDate } from "@/lib/utils";
import { summarizeSnapshot, type OfflineSnapshot } from "@/lib/offline/snapshot";
import { loadSnapshot } from "@/lib/offline/secure-store";
import { useLocale } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";

/**
 * The offline reading view. It is standalone (no session, no server data): it
 * decrypts whatever snapshot the device holds and lays it out. Because the page
 * itself contains no user data, the service worker can safely keep a copy.
 */
export function OfflineView() {
  const { t } = useLocale();
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    void loadSnapshot().then((loaded) => {
      if (!active) return;
      setSnapshot(loaded);
      setState(loaded ? "ready" : "empty");
    });
    return () => {
      active = false;
    };
  }, []);

  const summary = snapshot ? summarizeSnapshot(snapshot) : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <div className="mb-6 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-warning-surface text-warning-ink ring-1 ring-warning-border">
          <WifiOff className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-950 sm:text-2xl">
            {t.offline.pageTitle}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-ink-500">{t.offline.pageDescription}</p>
        </div>
      </div>

      {state === "loading" ? (
        <p className="text-sm text-ink-500">{t.offline.refreshing}</p>
      ) : state === "empty" || !snapshot || !summary ? (
        <div className="rounded-card border border-ink-200/80 bg-surface p-6 text-center shadow-card">
          <p className="text-sm leading-relaxed text-ink-600">{t.offline.empty}</p>
          <Link href="/" className={buttonClass("secondary", "md", "mt-4")}>
            {t.offline.openApp}
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <Badge tone="success" icon={<ShieldCheck className="size-3" aria-hidden="true" />}>
              {t.offline.enabledLabel}
            </Badge>
            <span>{t.offline.updated.replace("{when}", formatDate(snapshot.generatedAt))}</span>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <Stat label={t.offline.expiredLabel} value={summary.expired} tone="danger" />
            <Stat label={t.offline.upcomingLabel} value={summary.upcoming} tone="warning" />
          </div>

          {snapshot.items.length === 0 ? (
            <p className="text-sm text-ink-500">{t.offline.empty}</p>
          ) : (
            <ul className="divide-y divide-ink-100 overflow-hidden rounded-card border border-ink-200/80 bg-surface shadow-card">
              {snapshot.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-900">
                      {item.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
                      <span>{item.docTypeLabel}</span>
                      {item.memberName ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{item.memberName}</span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-ink-500">{formatDate(item.expiryDate)}</span>
                    <Badge tone={item.expired ? "danger" : "warning"}>
                      {item.expired ? t.offline.expiredLabel : t.offline.upcomingLabel}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-center text-xs text-ink-400">{t.offline.privacyLine}</p>
        </>
      )}

      <div className="mt-8 text-center">
        <Link href="/" className={buttonClass("ghost", "sm")}>
          <CalendarClock className="size-4" aria-hidden="true" />
          {t.offline.openApp}
        </Link>
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "danger" | "warning" }) {
  return (
    <div className="rounded-card border border-ink-200/80 bg-surface px-4 py-3 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === "danger" ? "text-danger-ink" : "text-warning-ink"}`}>
        {value}
      </p>
    </div>
  );
}
