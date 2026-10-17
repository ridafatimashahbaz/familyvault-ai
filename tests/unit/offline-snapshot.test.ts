import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  OFFLINE_SNAPSHOT_VERSION,
  buildSnapshot,
  isSnapshot,
  summarizeSnapshot,
  type SnapshotSourceItem,
} from "@/lib/offline/snapshot";

function source(overrides: Partial<SnapshotSourceItem> = {}): SnapshotSourceItem {
  return {
    id: "doc-1",
    title: "Passport",
    docTypeLabel: "Passport",
    category: "identity",
    familyMember: { name: "Ali" },
    expiryDate: "2026-03-15T00:00:00.000Z",
    isExpired: false,
    daysToExpiry: 40,
    ...overrides,
  };
}

describe("buildSnapshot", () => {
  test("drops documents without an expiry date", () => {
    const snapshot = buildSnapshot([
      source({ id: "keep" }),
      source({ id: "drop", expiryDate: null }),
    ]);
    assert.deepEqual(
      snapshot.items.map((item) => item.id),
      ["keep"],
    );
  });

  test("sorts soonest expiry first, ignoring the time part", () => {
    const snapshot = buildSnapshot([
      source({ id: "later", expiryDate: "2026-09-01T12:00:00.000Z" }),
      source({ id: "sooner", expiryDate: "2026-01-02T23:00:00.000Z" }),
      source({ id: "middle", expiryDate: "2026-05-05T00:00:00.000Z" }),
    ]);
    assert.deepEqual(
      snapshot.items.map((item) => item.id),
      ["sooner", "middle", "later"],
    );
  });

  test("carries only the allowed fields — no files, OCR text or notes", () => {
    const snapshot = buildSnapshot([source()]);
    assert.deepEqual(Object.keys(snapshot.items[0]).sort(), [
      "category",
      "daysToExpiry",
      "docTypeLabel",
      "expired",
      "expiryDate",
      "id",
      "memberName",
      "title",
    ]);
  });

  test("records the version, generation time and a sane horizon", () => {
    const now = new Date("2026-01-02T03:04:05.000Z");
    const snapshot = buildSnapshot([source()], { horizonDays: 99999, now });
    assert.equal(snapshot.version, OFFLINE_SNAPSHOT_VERSION);
    assert.equal(snapshot.generatedAt, "2026-01-02T03:04:05.000Z");
    assert.equal(snapshot.horizonDays, 3650);
  });

  test("defaults the horizon and copes with an empty list", () => {
    const snapshot = buildSnapshot([]);
    assert.equal(snapshot.items.length, 0);
    assert.equal(snapshot.horizonDays, 365);
  });

  test("nulls a missing family member", () => {
    const snapshot = buildSnapshot([source({ familyMember: null })]);
    assert.equal(snapshot.items[0].memberName, null);
  });
});

describe("isSnapshot", () => {
  test("accepts a freshly built snapshot", () => {
    assert.equal(isSnapshot(buildSnapshot([source()])), true);
  });

  test("rejects junk, wrong versions and malformed rows", () => {
    assert.equal(isSnapshot(null), false);
    assert.equal(isSnapshot("nope"), false);
    assert.equal(isSnapshot({}), false);
    assert.equal(isSnapshot({ version: 99, generatedAt: "x", horizonDays: 1, items: [] }), false);
    assert.equal(
      isSnapshot({
        version: OFFLINE_SNAPSHOT_VERSION,
        generatedAt: "2026-01-01T00:00:00.000Z",
        horizonDays: 365,
        items: [{ id: "x" }],
      }),
      false,
    );
  });
});

describe("summarizeSnapshot", () => {
  test("counts expired and upcoming and finds the next one", () => {
    const snapshot = buildSnapshot([
      source({ id: "expired", isExpired: true, daysToExpiry: -3, expiryDate: "2026-01-01T00:00:00.000Z" }),
      source({ id: "next", expiryDate: "2026-02-01T00:00:00.000Z", daysToExpiry: 20 }),
      source({ id: "later", expiryDate: "2026-06-01T00:00:00.000Z", daysToExpiry: 140 }),
    ]);
    const summary = summarizeSnapshot(snapshot);
    assert.equal(summary.expired, 1);
    assert.equal(summary.upcoming, 2);
    assert.equal(summary.next?.id, "next");
  });

  test("reports nothing when empty", () => {
    const summary = summarizeSnapshot(buildSnapshot([]));
    assert.deepEqual(summary, { expired: 0, upcoming: 0, next: null });
  });
});
