import type { VaultDocumentSummary } from "./documents";

/**
 * Expiry reminders, worked out from what is already on this device.
 *
 * Three rules that matter:
 *
 * 1. A date the person has not confirmed against the original is never treated
 *    as a reminder. It is listed separately as "check this first", because a
 *    wrong date read off a scan is how people get told a document expired when
 *    it did not.
 * 2. Each stage fires once per document per date. The key carries the date, so
 *    moving an expiry from March to June is allowed to alert again — that is a
 *    real change, not a duplicate.
 * 3. Nothing here can wake a phone. There is no server and no push service in
 *    this app, so a reminder can only be raised while the app is open. The copy
 *    in the UI says exactly that instead of promising more.
 */

export const WARNING_DAYS = 7;

export type ReminderStage = "past" | "due" | "warning";

export type ExpiryReminder = {
  documentId: string;
  name: string;
  owner?: string;
  expiryDate: string;
  stage: ReminderStage;
  daysUntil: number;
  key: string;
};

export type UnconfirmedExpiry = {
  documentId: string;
  name: string;
  expiryDate: string;
  daysUntil: number;
};

export type ReminderPlan = {
  alerts: ExpiryReminder[];
  needsChecking: UnconfirmedExpiry[];
};

/** Midnight-local `yyyy-mm-dd`, so "today" is a date and not a timestamp. */
export function dateKey(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole days from `today` to `iso`; negative means the date has passed. */
export function daysBetween(todayIso: string, iso: string): number {
  const a = Date.parse(`${todayIso}T00:00:00Z`);
  const b = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}

export function stageFor(daysUntil: number): ReminderStage | null {
  if (Number.isNaN(daysUntil)) return null;
  if (daysUntil < 0) return "past";
  if (daysUntil === 0) return "due";
  if (daysUntil <= WARNING_DAYS) return "warning";
  return null;
}

function expiryOf(document: VaultDocumentSummary): string | null {
  const value = document.meta?.expiryDate;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function confirmedOf(document: VaultDocumentSummary): boolean {
  return document.meta?.expiryReview?.confirmed === true;
}

export function planReminders(documents: VaultDocumentSummary[], now = new Date()): ReminderPlan {
  const today = dateKey(now);
  const alerts: ExpiryReminder[] = [];
  const needsChecking: UnconfirmedExpiry[] = [];

  for (const document of documents) {
    if (document.unreadable) continue;
    const expiryDate = expiryOf(document);
    if (!expiryDate) continue;
    const daysUntil = daysBetween(today, expiryDate);
    const stage = stageFor(daysUntil);
    const name = typeof document.meta?.name === "string" ? document.meta.name : "Untitled document";
    const owner = typeof document.meta?.person === "string" && document.meta.person.trim() ? document.meta.person.trim() : undefined;

    if (!confirmedOf(document)) {
      needsChecking.push({ documentId: document.id, name, expiryDate, daysUntil });
      continue;
    }
    if (!stage) continue;

    alerts.push({
      documentId: document.id,
      name,
      owner,
      expiryDate,
      stage,
      daysUntil,
      key: `${document.id}:${stage}:${expiryDate}`,
    });
  }

  alerts.sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name));
  needsChecking.sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name));
  return { alerts, needsChecking };
}

/**
 * Documents whose confirmed expiry is further away than the warning window, so
 * the workspace can still show them without pretending they are urgent.
 */
export function upcomingConfirmed(documents: VaultDocumentSummary[], now = new Date()): UnconfirmedExpiry[] {
  const today = dateKey(now);
  const later: UnconfirmedExpiry[] = [];
  for (const document of documents) {
    if (document.unreadable || !confirmedOf(document)) continue;
    const expiryDate = expiryOf(document);
    if (!expiryDate) continue;
    const daysUntil = daysBetween(today, expiryDate);
    if (Number.isNaN(daysUntil) || daysUntil <= WARNING_DAYS) continue;
    later.push({ documentId: document.id, name: document.meta?.name ?? "Untitled document", expiryDate, daysUntil });
  }
  return later.sort((a, b) => a.daysUntil - b.daysUntil);
}

const SEEN_KEY = "fv-reminders-seen-v1";

export type SeenLedger = Record<string, true>;

/**
 * Only keys are stored — a document id, a stage and a date. Names, categories
 * and contents stay inside the encrypted vault, and no key material is ever
 * written here.
 */
export function readSeenLedger(storage: Storage | null = storageOf()): SeenLedger {
  if (!storage) return {};
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SEEN_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const seen: SeenLedger = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === true) seen[key] = true;
    }
    return seen;
  } catch {
    return {};
  }
}

export function unseen(alerts: ExpiryReminder[], seen: SeenLedger): ExpiryReminder[] {
  return alerts.filter((alert) => !seen[alert.key]);
}

export function markSeen(alerts: ExpiryReminder[], storage: Storage | null = storageOf()): SeenLedger {
  const seen = readSeenLedger(storage);
  for (const alert of alerts) seen[alert.key] = true;
  try {
    storage?.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // A full or blocked storage area only means the alert shows again next time.
  }
  return seen;
}

/** Forget the ledger, e.g. after a vault is cleared, so nothing stale lingers. */
export function clearSeen(storage: Storage | null = storageOf()): void {
  try {
    storage?.removeItem(SEEN_KEY);
  } catch {
    // Nothing to do if the area cannot be written.
  }
}

function storageOf(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function reminderHeadline(alert: ExpiryReminder): string {
  if (alert.stage === "past") {
    const days = Math.abs(alert.daysUntil);
    return `${alert.name} expired ${days} ${days === 1 ? "day" : "days"} ago`;
  }
  if (alert.stage === "due") return `${alert.name} expires today`;
  return `${alert.name} expires in ${alert.daysUntil} ${alert.daysUntil === 1 ? "day" : "days"}`;
}
