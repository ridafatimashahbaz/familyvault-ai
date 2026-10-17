import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  addDays,
  bucketByDay,
  buildMonthGrid,
  dayKey,
  monthKey,
  monthLabel,
  parseMonthKey,
  shiftMonth,
  toCalendarEvent,
  urgencyOf,
  weekdayLabels,
  type CalendarEvent,
} from "@/lib/calendar";

const base: CalendarEvent = {
  id: "d1",
  title: "Passport",
  date: "2026-03-15T00:00:00.000Z",
  memberName: "Ali",
  docTypeLabel: "Passport",
  category: "identity",
  categoryLabel: "Identity",
  expired: false,
  daysToExpiry: 40,
};

describe("date helpers", () => {
  test("dayKey takes the date part and ignores time", () => {
    assert.equal(dayKey("2026-03-15T23:59:59.000Z"), "2026-03-15");
    assert.equal(dayKey(new Date("2026-03-15T06:00:00.000Z")), "2026-03-15");
  });

  test("addDays crosses month and year boundaries", () => {
    assert.equal(addDays("2026-03-15", 1), "2026-03-16");
    assert.equal(addDays("2026-03-31", 1), "2026-04-01");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  });

  test("shiftMonth rolls the year over in both directions", () => {
    assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
    assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
    assert.deepEqual(shiftMonth(2026, 6, 7), { year: 2027, month: 1 });
  });

  test("parseMonthKey accepts YYYY-MM and rejects the rest", () => {
    assert.deepEqual(parseMonthKey("2026-03"), { year: 2026, month: 3 });
    assert.equal(parseMonthKey("2026-13"), null);
    assert.equal(parseMonthKey("2026-00"), null);
    assert.equal(parseMonthKey("1899-10"), null);
    assert.equal(parseMonthKey(""), null);
    assert.equal(parseMonthKey(null), null);
  });

  test("monthKey zero-pads the month", () => {
    assert.equal(monthKey(2026, 3), "2026-03");
    assert.equal(monthKey(2026, 11), "2026-11");
  });
});

describe("month grid", () => {
  test("always yields six weeks starting on a Monday", () => {
    for (const [year, month] of [
      [2026, 1],
      [2026, 2],
      [2026, 3],
      [2026, 12],
      [2024, 2],
    ] as const) {
      const cells = buildMonthGrid(year, month);
      assert.equal(cells.length, 42);
      const first = new Date(`${cells[0].key}T00:00:00Z`);
      assert.equal(first.getUTCDay(), 1, `${cells[0].key} is not a Monday`);
    }
  });

  test("in-month flags match the real day count", () => {
    const feb = buildMonthGrid(2026, 2);
    const inMonth = feb.filter((cell) => cell.inMonth);
    assert.equal(inMonth.length, 28);
    assert.equal(inMonth[0].day, 1);
    assert.equal(inMonth[inMonth.length - 1].day, 28);
  });

  test("a 31-day month has 31 in-month cells", () => {
    assert.equal(buildMonthGrid(2026, 1).filter((cell) => cell.inMonth).length, 31);
  });

  test("weekday labels are seven Monday-first entries", () => {
    const labels = weekdayLabels("en-GB");
    assert.equal(labels.length, 7);
    assert.equal(new Set(labels).size, 7);
  });

  test("monthLabel renders the requested month", () => {
    assert.match(monthLabel(2026, 3, "en-GB"), /March 2026/);
  });
});

describe("urgency and buckets", () => {
  test("urgencyOf classifies expired, soon and valid", () => {
    assert.equal(urgencyOf({ ...base, expired: true }, 30), "expired");
    assert.equal(urgencyOf({ ...base, daysToExpiry: 10 }, 30), "soon");
    assert.equal(urgencyOf({ ...base, daysToExpiry: 30 }, 30), "soon");
    assert.equal(urgencyOf({ ...base, daysToExpiry: 31 }, 30), "valid");
    assert.equal(urgencyOf({ ...base, daysToExpiry: null }, 30), "valid");
  });

  test("bucketByDay groups by date part", () => {
    const buckets = bucketByDay([
      base,
      { ...base, id: "d2", title: "ID card", date: "2026-03-15T12:00:00.000Z" },
      { ...base, id: "d3", title: "Insurance", date: "2026-04-01T00:00:00.000Z" },
    ]);
    assert.equal(buckets.size, 2);
    assert.equal(buckets.get("2026-03-15")?.length, 2);
    assert.equal(buckets.get("2026-04-01")?.length, 1);
  });

  test("each bucket is ordered expired, then soon, then valid", () => {
    const buckets = bucketByDay([
      { ...base, id: "valid", title: "Valid", daysToExpiry: 200 },
      { ...base, id: "soon", title: "Soon", daysToExpiry: 5 },
      { ...base, id: "expired", title: "Gone", expired: true },
    ]);
    assert.deepEqual(
      buckets.get("2026-03-15")?.map((event) => event.id),
      ["expired", "soon", "valid"],
    );
  });

  test("ties fall back to the title", () => {
    const buckets = bucketByDay([
      { ...base, id: "b", title: "Beta" },
      { ...base, id: "a", title: "Alpha" },
    ]);
    assert.deepEqual(
      buckets.get("2026-03-15")?.map((event) => event.title),
      ["Alpha", "Beta"],
    );
  });
});

describe("toCalendarEvent", () => {
  test("returns null without an expiry date", () => {
    assert.equal(
      toCalendarEvent({
        id: "d1",
        title: "No date",
        expiryDate: null,
        docTypeLabel: "Other",
        category: "other",
        categoryLabel: "Other",
        familyMember: null,
        isExpired: false,
        daysToExpiry: null,
      }),
      null,
    );
  });

  test("maps a document to an event", () => {
    const event = toCalendarEvent({
      id: "d9",
      title: "Lease",
      expiryDate: "2026-06-30T00:00:00.000Z",
      docTypeLabel: "Lease",
      category: "property",
      categoryLabel: "Property",
      familyMember: { name: "Sara" },
      isExpired: false,
      daysToExpiry: 90,
    });
    assert.ok(event);
    assert.equal(event.id, "d9");
    assert.equal(event.date, "2026-06-30T00:00:00.000Z");
    assert.equal(event.memberName, "Sara");
    assert.equal(event.category, "property");
  });
});
