import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildExtractedData,
  DATE_ROLES,
  dateKey,
  isIsoDate,
  parseExtractedData,
  reviewedDate,
} from "@/lib/pipeline/extracted-data";
import type { Classification } from "@/lib/pipeline/classify";
import type { DetectedDate } from "@/lib/pipeline/labelled-dates";

const classification = {
  docType: "cnic",
  category: "identity",
  confidence: 0.8,
  source: "local",
  matchedTerms: ["cnic", "date of expiry"],
} as unknown as Classification;

const expiry = {
  role: "expiry",
  iso: "2030-08-31",
  raw: "31-08-2030",
  page: 1,
  precision: "day",
  confidence: 0.9,
  evidence: "Date of Expiry 31-08-2030",
  reviewRequired: false,
  reasons: [],
} satisfies DetectedDate;

const appointment = {
  ...expiry,
  role: "appointment",
  iso: "2026-11-03",
  raw: "03/11/2026",
  page: 2,
  confidence: 0.6,
  reviewRequired: true,
  reasons: ["day and month order is unclear in this format"],
} satisfies DetectedDate;

const output = {
  fields: { Name: "AYESHA SIDDIQUI" },
  classification,
  pageCount: 3,
  pagesRead: 2,
  labelledDates: [expiry, appointment],
};

describe("extracted data contract", () => {
  test("stores the page count and the labelled dates", () => {
    const stored = buildExtractedData(output, null);
    assert.equal(stored.pageCount, 3);
    assert.equal(stored.pagesRead, 2);
    assert.deepEqual(stored.dates, [expiry, appointment]);
    assert.equal(stored.textEdited, false);
    assert.deepEqual(stored.reviewed, {});
  });

  test("round-trips through the database column", () => {
    const stored = buildExtractedData(output, null);
    assert.deepEqual(parseExtractedData(JSON.stringify(stored)), stored);
  });

  test("reads rows written before this contract existed", () => {
    const legacy = parseExtractedData(JSON.stringify({ fields: { Name: "ALI" }, evidence: ["cnic"] }));
    assert.deepEqual(legacy.fields, { Name: "ALI" });
    assert.deepEqual(legacy.evidence, ["cnic"]);
    assert.deepEqual(legacy.dates, []);
    assert.deepEqual(legacy.reviewed, {});
    assert.equal(legacy.pageCount, null);
  });

  test("survives junk in the column instead of throwing", () => {
    for (const raw of [null, "", "not json", "[]", '{"dates":"nope","reviewed":7}', '{"fields":3}']) {
      const parsed = parseExtractedData(raw);
      assert.deepEqual(parsed.dates, []);
      assert.deepEqual(parsed.fields, {});
    }
  });

  test("drops a stored date that is not a date", () => {
    const parsed = parseExtractedData(
      JSON.stringify({ dates: [{ role: "expiry", iso: "31/08/2030" }] }),
    );
    assert.deepEqual(parsed.dates, []);
  });

  test("keeps the user's decisions across a re-analyse", () => {
    const decided = {
      ...buildExtractedData(output, null),
      reviewed: { [dateKey(appointment)]: { action: "confirmed" as const, decidedAt: "2026-10-01T10:00:00.000Z" } },
      textEdited: true,
    };

    const rebuilt = buildExtractedData(output, decided);
    assert.deepEqual(rebuilt.reviewed, decided.reviewed);
    assert.equal(rebuilt.textEdited, true);
  });

  test("keeps a decision for a date the reader can no longer find", () => {
    const decided = {
      reviewed: { "expiry:1999-01-01:7": { action: "ignored" as const, decidedAt: "2026-10-01T10:00:00.000Z" } },
    };

    const rebuilt = buildExtractedData(output, parseExtractedData(JSON.stringify(decided)));
    assert.ok(rebuilt.reviewed["expiry:1999-01-01:7"]);
  });
});

describe("reviewed dates", () => {
  const data = (reviewed: Record<string, { action: string; iso?: string; decidedAt: string }>) =>
    parseExtractedData(JSON.stringify({ reviewed }));

  test("is undefined when the user never decided", () => {
    assert.equal(reviewedDate(buildExtractedData(output, null), "expiry"), undefined);
  });

  test("returns the date the user confirmed", () => {
    const result = reviewedDate(
      data({ [dateKey(expiry)]: { action: "confirmed", decidedAt: "2026-10-01T10:00:00.000Z" } }),
      "expiry",
    );
    assert.equal(result?.kind, "date");
    assert.equal(result?.kind === "date" && result.date.toISOString(), "2030-08-31T00:00:00.000Z");
  });

  test("returns the corrected value, not the one that was misread", () => {
    const result = reviewedDate(
      data({ [dateKey(expiry)]: { action: "expiry", iso: "2031-01-15", decidedAt: "2026-10-01T10:00:00.000Z" } }),
      "expiry",
    );
    assert.equal(result?.kind === "date" && toDateKey(result.date), "2031-01-15");
  });

  test("reports a rejection as no date, so a re-analyse cannot resurrect it", () => {
    const result = reviewedDate(
      data({ [dateKey(expiry)]: { action: "ignored", decidedAt: "2026-10-01T10:00:00.000Z" } }),
      "expiry",
    );
    assert.deepEqual(result, { kind: "none" });
  });

  test("honours the most recent decision when there are several", () => {
    const result = reviewedDate(
      data({
        [dateKey(expiry)]: { action: "ignored", decidedAt: "2026-10-01T10:00:00.000Z" },
        "expiry:2032-05-05:manual": { action: "expiry", iso: "2032-05-05", decidedAt: "2026-10-09T09:00:00.000Z" },
      }),
      "expiry",
    );
    assert.equal(result?.kind === "date" && toDateKey(result.date), "2032-05-05");
  });

  test("does not let one role answer for another", () => {
    const decided = data({
      [dateKey(expiry)]: { action: "confirmed", decidedAt: "2026-10-01T10:00:00.000Z" },
    });
    assert.equal(reviewedDate(decided, "appointment"), undefined);
    assert.equal(reviewedDate(decided, "issue"), undefined);
  });

  test("finds an expiry the user chose from a date found under another heading", () => {
    const decided = data({
      [dateKey(appointment)]: { action: "expiry", iso: "2027-05-06", decidedAt: "2026-10-01T10:00:00.000Z" },
    });
    const result = reviewedDate(decided, "expiry");
    assert.equal(result?.kind === "date" && toDateKey(result.date), "2027-05-06");
  });

  test("keeps the value the user settled on for the heading it was found under", () => {
    const decided = data({
      [dateKey(appointment)]: { action: "expiry", iso: "2027-05-06", decidedAt: "2026-10-01T10:00:00.000Z" },
    });
    const result = reviewedDate(decided, "appointment");
    assert.equal(result?.kind === "date" && toDateKey(result.date), "2027-05-06");
  });

  test("does not let a rejected appointment wipe an expiry chosen from another date", () => {
    const decided = data({
      [dateKey(appointment)]: { action: "ignored", decidedAt: "2026-10-05T10:00:00.000Z" },
      [dateKey(expiry)]: { action: "confirmed", decidedAt: "2026-10-01T10:00:00.000Z" },
    });
    const result = reviewedDate(decided, "expiry");
    assert.equal(result?.kind === "date" && toDateKey(result.date), "2030-08-31");
  });

  test("skips a decision whose stored date is unusable", () => {
    const result = reviewedDate(
      data({ "expiry:31-08-2030:1": { action: "confirmed", decidedAt: "2026-10-01T10:00:00.000Z" } }),
      "expiry",
    );
    assert.equal(result, undefined);
  });
});

describe("date keys", () => {
  test("are stable for one detected date and unique per role and page", () => {
    assert.equal(dateKey(expiry), "expiry:2030-08-31:1");
    assert.equal(dateKey(appointment), "appointment:2026-11-03:2");
    assert.notEqual(dateKey(expiry), dateKey({ ...expiry, page: 2 }));
  });

  test("cover every role the detector can produce", () => {
    assert.deepEqual(
      [...DATE_ROLES].sort(),
      [
        "academicDeadline",
        "appointment",
        "examination",
        "expiry",
        "followUp",
        "issue",
        "other",
        "paymentDue",
        "prescription",
        "renewal",
      ],
    );
  });

  test("isIsoDate only accepts the stored form", () => {
    assert.equal(isIsoDate("2030-08-31"), true);
    for (const bad of ["31-08-2030", "2030-8-31", "2030-08-31T00:00:00.000Z", "2030-08-311", ""]) {
      assert.equal(isIsoDate(bad), false, bad);
    }
  });
});

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
