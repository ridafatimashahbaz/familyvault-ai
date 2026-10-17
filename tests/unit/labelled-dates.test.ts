import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { DATE_ROLE_LABELS, detectLabelledDates, type TextPage } from "@/lib/pipeline/labelled-dates";

import { CLINIC_VISIT_TEXT, CNIC_TEXT, INSURANCE_TEXT, LAB_REPORT_TEXT } from "../fixtures/ocr-text";

const page1 = (text: string): TextPage[] => [{ page: 1, text }];
const byRole = (role: string) => detectLabelledDates(page1(CLINIC_VISIT_TEXT)).find((d) => d.role === role);

describe("context-aware date roles", () => {
  test("keeps appointment, follow-up and document expiry separate", () => {
    const dates = detectLabelledDates(page1(
      "Appointment: 18 November 2026\nFollow-up: 25 November 2026\nDocument expires: 30 November 2026",
    ));
    assert.deepEqual(dates.map(({ role, iso }) => [role, iso]), [
      ["appointment", "2026-11-18"],
      ["followUp", "2026-11-25"],
      ["expiry", "2026-11-30"],
    ]);
    assert.equal(detectLabelledDates(page1("Document expires: unreadable" )).length, 0);
  });

  test("reads an appointment date without calling it an expiry", () => {
    const appointment = byRole("appointment");
    assert.ok(appointment, "expected an appointment date on the clinic card");
    assert.equal(appointment.iso, "2026-11-03", "day-first is the documented default for 03/11");
    assert.equal(DATE_ROLE_LABELS[appointment.role], "Appointment");

    const found = detectLabelledDates(page1(CLINIC_VISIT_TEXT));
    assert.equal(
      found.some((d) => d.role === "expiry"),
      false,
      "an appointment card must not gain an expiry date",
    );
  });

  test("flags an ambiguous numeric date for review instead of presenting it as fact", () => {
    const appointment = byRole("appointment")!;
    assert.equal(appointment.reviewRequired, true);
    assert.ok(
      appointment.reasons.some((r) => r.includes("day and month order")),
      `reasons were ${JSON.stringify(appointment.reasons)}`,
    );
  });

  test("keeps the printed characters and the evidence beside the date", () => {
    const prescription = byRole("prescription")!;
    assert.equal(prescription.iso, "2026-09-12");
    assert.equal(prescription.raw, "12-09-2026", "the user must see what the document actually said");
    assert.match(prescription.evidence, /Prescription Date/i);
  });

  test("quotes evidence from a whole word, never the tail of one", () => {
    for (const text of [CLINIC_VISIT_TEXT, INSURANCE_TEXT, LAB_REPORT_TEXT, CNIC_TEXT]) {
      for (const date of detectLabelledDates(page1(text))) {
        const first = date.evidence.split(/\s+/)[0]!;
        assert.ok(
          new RegExp(`(^|\\s)${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(text),
          `"${date.evidence}" opens inside the word "${first}"`,
        );
      }
    }
  });

  test("reports an unlabelled date as information only", () => {
    const others = detectLabelledDates(page1(CLINIC_VISIT_TEXT)).filter((d) => d.role === "other");
    assert.ok(others.length > 0, "the consultation date has no role of its own");
    for (const date of others) {
      assert.equal(date.reviewRequired, true);
      assert.ok(
        date.reasons.some((r) => r.includes("no label")),
        `reasons were ${JSON.stringify(date.reasons)}`,
      );
    }
  });

  test("separates renewal, payment due and coverage end on an insurance notice", () => {
    const found = detectLabelledDates(page1(INSURANCE_TEXT));
    const role = (r: string) => found.find((d) => d.role === r);

    assert.equal(role("issue")?.iso, "2025-11-20");
    assert.equal(role("expiry")?.iso, "2026-11-19");
    assert.equal(role("renewal")?.iso, "2026-11-30");
    assert.equal(role("paymentDue")?.iso, "2026-11-15");
  });

  test("attributes a date to the page it was read from", () => {
    const pages: TextPage[] = [
      { page: 1, text: "Date of Issue 01-09-2020" },
      { page: 2, text: "Date of Expiry 31-08-2030" },
    ];

    const found = detectLabelledDates(pages);
    assert.deepEqual(
      found.map((d) => [d.role, d.iso, d.page]),
      [
        ["issue", "2020-09-01", 1],
        ["expiry", "2030-08-31", 2],
      ],
    );
  });

  test("never invents a year that is not printed", () => {
    assert.deepEqual(detectLabelledDates(page1("Next appointment 12 March, bring reports")), []);
    assert.deepEqual(detectLabelledDates(page1("Follow up after 30 days")), []);
  });

  test("reads a lab report's collection date as an examination date", () => {
    const found = detectLabelledDates(page1(LAB_REPORT_TEXT));
    assert.equal(found.find((d) => d.role === "examination")?.iso, "2026-09-02");
  });

  test("does not report one date twice for the same role", () => {
    const found = detectLabelledDates(page1(CNIC_TEXT));
    const expiries = found.filter((d) => d.role === "expiry");
    assert.equal(expiries.length, 1);
    assert.equal(expiries[0]!.iso, "2030-08-31");
  });

  test("marks a low-confidence page so its dates are not trusted", () => {
    const found = detectLabelledDates(page1("Date of Expiry 31-08-2030"), { ocrConfidence: 41 });
    assert.equal(found[0]!.reviewRequired, true);
    assert.ok(found[0]!.reasons.some((r) => r.includes("certainty")));
  });

  test("returns nothing for a page with no text", () => {
    assert.deepEqual(detectLabelledDates([{ page: 1, text: "" }]), []);
  });
});
