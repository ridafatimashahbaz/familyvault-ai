/**
 * Expiry reminders for the offline vault.
 *
 * The claims worth testing are the ones the product makes to a family:
 *  - an unconfirmed date never becomes a reminder;
 *  - a date far away stays quiet, and the warning starts exactly 7 days out;
 *  - the expiry day and an already-expired document both speak plainly;
 *  - the same document and date is only announced once, but a corrected date
 *    is allowed to announce again;
 *  - the device-side ledger holds keys only — no name, no date text beyond the
 *    expiry it already had, and never any key material.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { VaultDocumentSummary } from "@vault/documents";
import {
  clearSeen,
  daysBetween,
  markSeen,
  planReminders,
  reminderHeadline,
  readSeenLedger,
  stageFor,
  unseen,
  upcomingConfirmed,
  WARNING_DAYS,
} from "@vault/reminders";

const TODAY = new Date(2026, 9, 16); // 16 October 2026, local

function doc(id: string, expiryDate: string | null | undefined, confirmed: boolean, name = id): VaultDocumentSummary {
  return {
    id,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    meta: {
      name,
      mimeType: "application/pdf",
      sizeBytes: 656,
      category: "identity",
      expiryDate: expiryDate ?? null,
      expiryReview: { source: "manual", confirmed },
    },
  };
}

function fakeStorage(): Storage & { dump(): string | null } {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    dump: () => map.get("fv-reminders-seen-v1") ?? null,
  };
}

describe("planReminders", () => {
  test("keeps a date nobody confirmed out of the alerts", () => {
    const plan = planReminders([doc("aamir-passport", "2026-10-16", false)], TODAY);
    assert.deepEqual(plan.alerts, []);
    assert.equal(plan.needsChecking.length, 1);
    assert.equal(plan.needsChecking[0]!.documentId, "aamir-passport");
  });

  test("stays quiet until the warning window and starts exactly 7 days out", () => {
    const far = planReminders([doc("far", iso(8), true)], TODAY);
    assert.deepEqual(far.alerts, []);
    const edge = planReminders([doc("edge", iso(WARNING_DAYS), true)], TODAY);
    assert.equal(edge.alerts.length, 1);
    assert.equal(edge.alerts[0]!.stage, "warning");
  });

  test("calls the expiry day and an overdue document what they are", () => {
    const today = planReminders([doc("today", iso(0), true)], TODAY);
    assert.equal(today.alerts[0]!.stage, "due");
    assert.equal(reminderHeadline(today.alerts[0]!), "today expires today");

    const late = planReminders([doc("late", iso(-1), true)], TODAY);
    assert.equal(late.alerts[0]!.stage, "past");
    assert.equal(reminderHeadline(late.alerts[0]!), "late expired 1 day ago");

    const older = planReminders([doc("older", iso(-9), true)], TODAY);
    assert.equal(reminderHeadline(older!.alerts[0]!), "older expired 9 days ago");
  });

  test("ignores documents with no usable date and unreadable records", () => {
    const plan = planReminders(
      [
        doc("none", undefined, true),
        doc("month-only", "2026-11", true),
        { ...doc("broken", iso(2), true), unreadable: true },
      ],
      TODAY,
    );
    assert.deepEqual(plan.alerts, []);
    assert.deepEqual(plan.needsChecking, []);
  });

  test("sorts soonest first so the urgent one leads", () => {
    const plan = planReminders([doc("later", iso(6), true), doc("sooner", iso(1), true)], TODAY);
    assert.deepEqual(plan.alerts.map((alert) => alert.name), ["sooner", "later"]);
  });

  test("upcomingConfirmed lists the calm ones and never the unconfirmed", () => {
    const later = upcomingConfirmed([doc("soon", iso(3), true), doc("away", iso(40), true), doc("maybe", iso(40), false)], TODAY);
    assert.deepEqual(later.map((item) => item.name), ["away"]);
  });
});

describe("reminder deduplication", () => {
  test("one document and date is announced once, then stays quiet", () => {
    const storage = fakeStorage();
    clearSeen(storage);
    const [first] = planReminders([doc("passport", iso(3), true)], TODAY).alerts;
    assert.ok(first);
    assert.deepEqual(unseen([first], readSeenLedger(storage)), [first]);
    markSeen([first], storage);
    assert.deepEqual(unseen([first], readSeenLedger(storage)), []);
  });

  test("a corrected expiry date is allowed to raise the alert again", () => {
    const storage = fakeStorage();
    clearSeen(storage);
    const original = planReminders([doc("passport", iso(3), true)], TODAY).alerts[0]!;
    markSeen([original], storage);
    const corrected = planReminders([doc("passport", iso(5), true)], TODAY).alerts[0]!;
    assert.notEqual(corrected.key, original.key);
    assert.deepEqual(unseen([corrected], readSeenLedger(storage)), [corrected]);
  });

  test("the ledger stores keys only, not names or contents", () => {
    const storage = fakeStorage();
    clearSeen(storage);
    const alerts = planReminders([doc("9f2c41d0-7a5b-4c1e-8d3a-1b6f0e2c5d77", iso(2), true, "Aamir CNIC")], TODAY).alerts;
    markSeen(alerts, storage);
    const raw = storage.dump() ?? "";
    assert.ok(raw.includes("9f2c41d0-7a5b-4c1e-8d3a-1b6f0e2c5d77:warning:"));
    assert.ok(!raw.includes("Aamir"));
    assert.ok(!raw.includes("CNIC"));
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed).length, 1);
    assert.ok(Object.values(parsed).every((value) => value === true));
  });

  test("a damaged or hand-written ledger is treated as empty rather than thrown", () => {
    const broken = fakeStorage();
    broken.setItem("fv-reminders-seen-v1", "not json at all");
    assert.deepEqual(readSeenLedger(broken), {});
    broken.setItem("fv-reminders-seen-v1", JSON.stringify({ k: "not-true", other: 1, good: true }));
    assert.deepEqual(readSeenLedger(broken), { good: true });
  });

  test("no storage area means nothing is remembered", () => {
    assert.deepEqual(readSeenLedger(null), {});
    assert.deepEqual(unseen([], readSeenLedger(null)), []);
  });
});

describe("date maths", () => {
  test("daysBetween counts whole days in both directions", () => {
    assert.equal(daysBetween("2026-10-16", "2026-10-16"), 0);
    assert.equal(daysBetween("2026-10-16", "2026-10-23"), 7);
    assert.equal(daysBetween("2026-10-16", "2026-10-13"), -3);
    assert.equal(daysBetween("2026-10-16", "2026-13-01"), Number.NaN);
  });

  test("stageFor matches the window it documents", () => {
    assert.equal(stageFor(8), null);
    assert.equal(stageFor(7), "warning");
    assert.equal(stageFor(0), "due");
    assert.equal(stageFor(-1), "past");
    assert.equal(stageFor(Number.NaN), null);
  });
});

function iso(offsetDays: number): string {
  const date = new Date(TODAY);
  date.setDate(date.getDate() + offsetDays);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
