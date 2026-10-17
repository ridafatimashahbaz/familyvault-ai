import assert from "node:assert/strict";
import { before, describe, mock, test } from "node:test";

import { ApiRequestError } from "@/lib/api";
import { MAX_TEXT_EDIT_CHARS } from "@/lib/constants";
import type { DateDecision } from "@/lib/pipeline/extracted-data";

/**
 * The correction path: a signed-in user editing the text that was read out of
 * their own document, and recording what they decided about a detected date.
 *
 * Only the Prisma client is faked, so these tests exercise the real service
 * code - the ownership check, the bound on saved text, and the rule that a
 * decision the user made outranks the machine's next guess.
 */

type MockModuleOptions = Parameters<typeof mock.module>[1];

const stored = new Map<string, Record<string, unknown>>();

function seed(over: Record<string, unknown> = {}): void {
  stored.set("doc-1", {
    id: "doc-1",
    userId: "user-1",
    title: "Clinic card",
    originalName: "card.jpg",
    extension: "jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    storageKey: "user-1/key",
    docType: "other",
    category: "other",
    classificationConfidence: 0.2,
    classificationSource: "local",
    status: "ready",
    ocrStatus: "done",
    ocrEngine: "tesseract",
    ocrConfidence: 62,
    ocrText: "Next Appointment 03/11/2026",
    extractedData: JSON.stringify({
      fields: { Name: "AYESHA SIDDIQUI" },
      evidence: ["clinic"],
      pageCount: 1,
      pagesRead: 1,
      dates: [
        {
          role: "appointment",
          iso: "2026-11-03",
          raw: "03/11/2026",
          page: 1,
          precision: "day",
          confidence: 0.6,
          evidence: "Next Appointment 03/11/2026",
          reviewRequired: true,
          reasons: ["day and month order is unclear in this format"],
        },
      ],
      reviewed: {},
      textEdited: false,
    }),
    summary: "A document.",
    summarySource: "local",
    notes: null,
    issueDate: null,
    expiryDate: null,
    expirySource: null,
    noExpiry: false,
    errorMessage: null,
    encrypted: true,
    processedAt: new Date("2026-10-01"),
    createdAt: new Date("2026-10-01"),
    updatedAt: new Date("2026-10-01"),
    familyMember: null,
    tags: [],
    ...over,
  });
}

const prisma = {
  document: {
    findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
      const row = stored.get(where.id);
      return row && row.userId === where.userId ? { ...row } : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = stored.get(where.id)!;
      const next = { ...row, ...data };
      stored.set(where.id, next);
      return { ...next };
    },
  },
  familyMember: {
    findFirst: async () => ({ id: "member-1" }),
  },
};

mock.module("@/lib/prisma", {
  exports: { prisma },
} as unknown as MockModuleOptions);

// The service is imported *after* the mock is registered (tsx compiles tests to
// CJS, so the import cannot be a top-level `await`).
let updateDocument: typeof import("@/lib/services/documents").updateDocument;

before(async () => {
  updateDocument = (await import("@/lib/services/documents")).updateDocument;
});

function current(): Record<string, unknown> {
  return stored.get("doc-1")!;
}

function extracted(): { reviewed: Record<string, DateDecision>; textEdited: boolean } {
  return JSON.parse(String(current().extractedData));
}

describe("correcting the recognised text", () => {
  test("saves what the user typed and remembers it was theirs", async () => {
    seed();
    await updateDocument("doc-1", "user-1", { text: "Next Appointment 03 November 2026" });

    assert.equal(current().ocrText, "Next Appointment 03 November 2026");
    assert.equal(extracted().textEdited, true);
  });

  test("refuses a document that belongs to someone else", async () => {
    seed();
    await assert.rejects(
      () => updateDocument("doc-1", "user-2", { text: "not yours" }),
      (error: unknown) => error instanceof ApiRequestError && error.status === 404,
    );
    assert.equal(current().ocrText, "Next Appointment 03/11/2026", "nothing was written");
  });

  test("rejects text over the bound instead of truncating it", async () => {
    seed();
    await assert.rejects(
      () => updateDocument("doc-1", "user-1", { text: "x".repeat(MAX_TEXT_EDIT_CHARS + 1) }),
      (error: unknown) => error instanceof ApiRequestError && error.status === 422,
    );
    assert.equal(extracted().textEdited, false);
  });

  test("leaves the existing decisions alone while saving text", async () => {
    seed({
      extractedData: JSON.stringify({
        fields: {},
        evidence: [],
        dates: [],
        reviewed: { "expiry:2030-08-31:1": { action: "confirmed", decidedAt: "2026-10-02T10:00:00.000Z" } },
        textEdited: false,
      }),
    });

    await updateDocument("doc-1", "user-1", { text: "corrected" });
    assert.ok(extracted().reviewed["expiry:2030-08-31:1"], "a prior confirmation must survive");
  });
});

describe("recording a decision about a detected date", () => {
  const key = "appointment:2026-11-03:1";

  test("confirming a date stores the decision and does not invent an expiry", async () => {
    seed();
    await updateDocument("doc-1", "user-1", { dateReview: { key, action: "confirmed" } });

    assert.deepEqual(extracted().reviewed[key], {
      action: "confirmed",
      decidedAt: String(extracted().reviewed[key].decidedAt),
    });
    assert.equal(current().expiryDate, null, "confirming an appointment is not setting an expiry");
  });

  test("a corrected value is filed under the date the app detected", async () => {
    seed();
    await updateDocument("doc-1", "user-1", {
      dateReview: { key, action: "confirmed", iso: "2026-11-03" },
    });

    assert.ok(extracted().reviewed[key], "the review UI must still find the decision by the detected key");
  });

  test('"use as expiry" moves the reminder column', async () => {
    seed();
    await updateDocument("doc-1", "user-1", {
      dateReview: { key, action: "expiry", iso: "2027-05-06" },
    });

    assert.equal((current().expiryDate as Date).toISOString(), "2027-05-06T00:00:00.000Z");
    assert.equal(current().expirySource, "confirmed by you");
    assert.equal(current().noExpiry, false);
    assert.equal(extracted().reviewed[key].iso, "2027-05-06");
  });

  test("withdrawing a date borrowed as the expiry clears the reminder", async () => {
    seed();
    await updateDocument("doc-1", "user-1", { dateReview: { key, action: "expiry" } });
    await updateDocument("doc-1", "user-1", { dateReview: { key, action: "ignored" } });

    assert.equal(current().expiryDate, null);
    assert.equal(current().expirySource, null);
    assert.equal(current().noExpiry, true);
  });

  test("rejecting an expiry clears it and says the document has none", async () => {
    seed({
      expiryDate: new Date("2026-11-03"),
      expirySource: 'label near "valid till"',
      extractedData: JSON.stringify({
        fields: {},
        evidence: [],
        dates: [
          {
            role: "expiry",
            iso: "2026-11-03",
            raw: "03/11/26",
            page: 1,
            precision: "day",
            confidence: 0.6,
            evidence: "Valid 03/11/26",
            reviewRequired: true,
            reasons: [],
          },
        ],
        reviewed: {},
        textEdited: false,
      }),
    });

    await updateDocument("doc-1", "user-1", { dateReview: { key: "expiry:2026-11-03:1", action: "ignored" } });

    assert.equal(current().expiryDate, null);
    assert.equal(current().expirySource, null);
    assert.equal(current().noExpiry, true);
  });

  test("refuses a key naming a role this app never detects", async () => {
    seed();
    for (const bad of ["nonsense:2026-11-03:1", "", "a:b:c:d:e".padEnd(200, "z")]) {
      await assert.rejects(
        () => updateDocument("doc-1", "user-1", { dateReview: { key: bad, action: "confirmed" } }),
        (error: unknown) => error instanceof ApiRequestError && error.status === 422,
      );
    }
    assert.deepEqual(extracted().reviewed, {});
  });

  test("refuses a malformed replacement date", async () => {
    seed();
    await assert.rejects(
      () => updateDocument("doc-1", "user-1", { dateReview: { key, action: "confirmed", iso: "03-11-2026" } }),
      (error: unknown) => error instanceof ApiRequestError && error.status === 422,
    );
    assert.deepEqual(extracted().reviewed, {});
  });

  test("a manually typed expiry is recorded as a decision so a re-analyse keeps it", async () => {
    seed();
    await updateDocument("doc-1", "user-1", { expiryDate: new Date("2028-02-29") });

    assert.equal(current().expirySource, "manual");
    assert.ok(extracted().reviewed["expiry:2028-02-29:manual"]);
  });

  test("caps how many decisions one document can accumulate", async () => {
    seed();
    for (let index = 0; index < 70; index += 1) {
      await updateDocument("doc-1", "user-1", {
        dateReview: { key: `other:2026-01-0${1 + (index % 8)}:${index}`, action: "confirmed" },
      });
    }

    assert.ok(Object.keys(extracted().reviewed).length <= 60);
  });
});
