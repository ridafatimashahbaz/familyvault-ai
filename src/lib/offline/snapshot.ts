/**
 * The offline "important information" snapshot.
 *
 * This is the only thing allowed to live on the device for offline use: a small,
 * flat list of expiry dates with just enough context to be useful. Document
 * files, OCR text, notes and extracted fields are deliberately never included —
 * the shape below is the whole vocabulary, so nothing else can leak by accident.
 *
 * Kept pure (no browser APIs) so it can be unit-tested and reused by both the
 * save path and the offline reader.
 */

import { dayKey } from "@/lib/calendar";

export const OFFLINE_SNAPSHOT_VERSION = 1;

export type SnapshotItem = {
  id: string;
  title: string;
  docTypeLabel: string;
  category: string;
  memberName: string | null;
  /** ISO date the document expires. */
  expiryDate: string;
  daysToExpiry: number | null;
  expired: boolean;
};

export type OfflineSnapshot = {
  version: number;
  /** ISO timestamp of when this snapshot was captured. */
  generatedAt: string;
  /** How many days ahead the snapshot was built for. */
  horizonDays: number;
  items: SnapshotItem[];
};

/** The subset of a serialized document the snapshot is allowed to read. */
export type SnapshotSourceItem = {
  id: string;
  title: string;
  docTypeLabel: string;
  category: string;
  familyMember: { name: string } | null;
  expiryDate: string | null;
  isExpired: boolean;
  daysToExpiry: number | null;
};

export type SnapshotOptions = {
  horizonDays?: number;
  now?: Date;
};

function clampHorizon(days: number | undefined): number {
  if (!Number.isFinite(days) || !days || days < 1) return 365;
  return Math.min(Math.round(days), 3650);
}

/**
 * Builds a snapshot from serialized documents, dropping anything without an
 * expiry date and sorting soonest-first so the offline view needs no sorting.
 */
export function buildSnapshot(
  items: SnapshotSourceItem[],
  { horizonDays, now = new Date() }: SnapshotOptions = {},
): OfflineSnapshot {
  const rows: SnapshotItem[] = [];

  for (const item of items) {
    if (!item.expiryDate) continue;
    rows.push({
      id: item.id,
      title: item.title,
      docTypeLabel: item.docTypeLabel,
      category: item.category,
      memberName: item.familyMember?.name ?? null,
      expiryDate: item.expiryDate,
      daysToExpiry: item.daysToExpiry,
      expired: item.isExpired,
    });
  }

  rows.sort((a, b) => dayKey(a.expiryDate).localeCompare(dayKey(b.expiryDate)));

  return {
    version: OFFLINE_SNAPSHOT_VERSION,
    generatedAt: now.toISOString(),
    horizonDays: clampHorizon(horizonDays),
    items: rows,
  };
}

/** Runtime guard for data decrypted back out of storage — never trust it blindly. */
export function isSnapshot(value: unknown): value is OfflineSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<OfflineSnapshot>;
  if (candidate.version !== OFFLINE_SNAPSHOT_VERSION) return false;
  if (typeof candidate.generatedAt !== "string") return false;
  if (typeof candidate.horizonDays !== "number") return false;
  if (!Array.isArray(candidate.items)) return false;

  return candidate.items.every((item) => {
    if (typeof item !== "object" || item === null) return false;
    const row = item as Partial<SnapshotItem>;
    return (
      typeof row.id === "string" &&
      typeof row.title === "string" &&
      typeof row.docTypeLabel === "string" &&
      typeof row.category === "string" &&
      (row.memberName === null || typeof row.memberName === "string") &&
      typeof row.expiryDate === "string" &&
      (row.daysToExpiry === null || typeof row.daysToExpiry === "number") &&
      typeof row.expired === "boolean"
    );
  });
}

export type SnapshotSummary = {
  expired: number;
  upcoming: number;
  next: SnapshotItem | null;
};

export function summarizeSnapshot(snapshot: OfflineSnapshot): SnapshotSummary {
  let expired = 0;
  let upcoming = 0;
  let next: SnapshotItem | null = null;

  for (const item of snapshot.items) {
    if (item.expired) expired += 1;
    else {
      upcoming += 1;
      if (!next) next = item;
    }
  }

  return { expired, upcoming, next };
}
