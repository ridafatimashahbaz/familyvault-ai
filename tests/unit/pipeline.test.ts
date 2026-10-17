import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { findDates, findDateAfterLabel, toDateKey } from "@/lib/pipeline/dates";
import { classifyDocument } from "@/lib/pipeline/classify";
import { extractFields, sortFields } from "@/lib/pipeline/extract";
import { detectDates, reconcileExpiry } from "@/lib/pipeline/expiry";
import { detectLabelledDates, type DetectedDate } from "@/lib/pipeline/labelled-dates";
import { summarizeLocally } from "@/lib/ai/summarize";
import { scoreDocuments, type RetrievalDoc } from "@/lib/ai/retrieval";

import {
  BIRTH_CERTIFICATE_TEXT,
  CNIC_TEXT,
  DEGREE_TEXT,
  GIBBERISH_TEXT,
  LAB_REPORT_TEXT,
  LEASE_TEXT,
  PASSPORT_TEXT,
  UTILITY_BILL_TEXT,
} from "../fixtures/ocr-text";

describe("date parsing", () => {
  test("reads numeric day-first dates", () => {
    const [parsed] = findDates("Date of Expiry 31-08-2030");
    assert.equal(toDateKey(parsed!.date), "2030-08-31");
  });

  test("reads slash and dot separators", () => {
    assert.equal(toDateKey(findDates("15/03/1988")[0]!.date), "1988-03-15");
    assert.equal(toDateKey(findDates("15.03.1988")[0]!.date), "1988-03-15");
  });

  test("reads ISO dates", () => {
    assert.equal(toDateKey(findDates("Issued 2026-09-25")[0]!.date), "2026-09-25");
  });

  test("reads month-name dates in both orders", () => {
    assert.equal(toDateKey(findDates("31 MAR 2031")[0]!.date), "2031-03-31");
    assert.equal(toDateKey(findDates("March 5, 2030")[0]!.date), "2030-03-05");
    assert.equal(toDateKey(findDates("15th August 2027")[0]!.date), "2027-08-15");
  });

  test("expands two-digit years around the 50 pivot", () => {
    assert.equal(toDateKey(findDates("15-08-27")[0]!.date), "2027-08-15");
    assert.equal(toDateKey(findDates("15-08-98")[0]!.date), "1998-08-15");
  });

  test("rejects dates that do not exist", () => {
    assert.equal(findDates("31-02-2027").length, 0);
    assert.equal(findDates("45-13-2027").length, 0);
  });

  test("rejects implausible years", () => {
    assert.equal(findDates("15-08-1830").length, 0);
    assert.equal(findDates("15-08-2530").length, 0);
  });

  test("does not report the same span twice in two formats", () => {
    const results = findDates("Valid until 15 August 2027");
    assert.equal(results.filter((r) => toDateKey(r.date) === "2027-08-15").length, 1);
  });

  test("prefers an unambiguous reading over an ambiguous one", () => {
    const results = findDates("03/04/2027");
    // Day-first is the documented default when both components fit a month.
    assert.equal(toDateKey(results[0]!.date), "2027-04-03");
    assert.ok(results[0]!.confidence < 0.8, "ambiguous dates must be low confidence");
  });

  test("finds the date following a label", () => {
    const found = findDateAfterLabel(CNIC_TEXT, ["date of expiry", "expiry date"]);
    assert.ok(found, "expected an expiry date on the CNIC");
    assert.equal(toDateKey(found.date), "2030-08-31");
  });

  test("takes the date printed next to a label, not a later one on the line", () => {
    const text =
      "Health Insurance Policy\nDate of Issue 20-11-2025\nCoverage until 19-11-2026\nRenew before 30 November 2026";
    const found = findDateAfterLabel(text, ["date of issue"]);
    assert.ok(found);
    assert.equal(toDateKey(found.date), "2025-11-20");
  });
});

describe("document classification", () => {
  test("identifies a CNIC", () => {
    const result = classifyDocument(CNIC_TEXT, "cnic-front.jpg");
    assert.equal(result.docType, "cnic");
    assert.equal(result.category, "identity");
    assert.ok(result.confidence > 0.5, `confidence was ${result.confidence}`);
  });

  test("identifies a passport from its MRZ", () => {
    const result = classifyDocument(PASSPORT_TEXT, "scan0001.pdf");
    assert.equal(result.docType, "passport");
  });

  test("identifies a utility bill", () => {
    const result = classifyDocument(UTILITY_BILL_TEXT, "lesco-bill-august.pdf");
    assert.equal(result.docType, "utility_bill");
    assert.equal(result.category, "property");
  });

  test("identifies a birth certificate", () => {
    const result = classifyDocument(BIRTH_CERTIFICATE_TEXT, "document.pdf");
    assert.equal(result.docType, "birth_certificate");
    assert.equal(result.category, "civil");
  });

  test("identifies a degree", () => {
    const result = classifyDocument(DEGREE_TEXT, "convocation.pdf");
    assert.equal(result.docType, "degree");
    assert.equal(result.category, "education");
  });

  test("identifies a lease agreement", () => {
    const result = classifyDocument(LEASE_TEXT, "agreement.pdf");
    assert.equal(result.docType, "lease_agreement");
  });

  test("identifies a lab report", () => {
    const result = classifyDocument(LAB_REPORT_TEXT, "report.pdf");
    assert.equal(result.docType, "lab_report");
    assert.equal(result.category, "medical");
  });

  test("falls back to other for unreadable text", () => {
    const result = classifyDocument(GIBBERISH_TEXT, "scan001.jpg");
    assert.equal(result.docType, "other");
    assert.equal(result.confidence, 0);
  });

  test("classifies from the file name when OCR produced nothing", () => {
    const result = classifyDocument("", "passport-ahmed-khan.pdf");
    assert.equal(result.docType, "passport");
  });

  test("does not match a file-name hint inside an unrelated word", () => {
    // "nic" is a CNIC hint, and it sits inside "cli-nic": this used to be filed
    // as a national ID on the strength of the word "clinic" alone.
    assert.equal(classifyDocument("", "synthetic-clinic-card.pdf").docType, "other");
    assert.equal(classifyDocument("", "nic-front.jpg").docType, "cnic");
  });

  test("is more confident about a clear document than an ambiguous one", () => {
    const clear = classifyDocument(CNIC_TEXT, "cnic-front.jpg").confidence;
    const ambiguous = classifyDocument("date of birth 15-03-1988", "scan.jpg").confidence;

    assert.ok(clear > ambiguous, `clear ${clear} should exceed ambiguous ${ambiguous}`);
    assert.ok(clear < 0.98, `confidence pinned at ${clear} cannot discriminate`);
    assert.ok(ambiguous < 0.55, `ambiguous ${ambiguous} should stay low enough to invite review`);
  });
});

describe("field extraction", () => {
  test("reads the holder's name, not the father's", () => {
    const fields = extractFields(CNIC_TEXT, "cnic");
    assert.equal(fields["Name"], "MUHAMMAD AHMED KHAN");
    assert.equal(fields["Father's Name"], "ABDUL KHAN");
  });

  test("reads birth date and CNIC number", () => {
    const fields = extractFields(CNIC_TEXT, "cnic");
    assert.equal(fields["Date of Birth"], "15-03-1988");
    assert.equal(fields["CNIC Number"], "42101-1234567-8");
  });

  test("reads inline passport fields", () => {
    const fields = extractFields(PASSPORT_TEXT, "passport");
    assert.equal(fields["Surname"], "KHAN");
    assert.equal(fields["Given Names"], "MUHAMMAD AHMED");
    assert.equal(fields["Passport Number"], "AB1234567");
    assert.equal(fields["Date of Expiry"], "31 MAR 2031");
  });

  test("does not leak a later label into a value", () => {
    const fields = extractFields(UTILITY_BILL_TEXT, "utility_bill");
    assert.equal(fields["Consumer No"], "0123456789");
    assert.equal(fields["Billing Month"], "AUG 2026");
  });

  test("does not report an identifier a second time as a phone number", () => {
    assert.equal(extractFields(CNIC_TEXT, "cnic")["Phone"], undefined);
    assert.equal(extractFields(UTILITY_BILL_TEXT, "utility_bill")["Phone"], undefined);
  });

  test("does not read the passport MRZ as an IBAN", () => {
    assert.equal(extractFields(PASSPORT_TEXT, "passport")["IBAN"], undefined);
  });

  test("keeps a single-character gender value", () => {
    assert.equal(extractFields(PASSPORT_TEXT, "passport")["Sex"], "M");
    assert.equal(extractFields(BIRTH_CERTIFICATE_TEXT, "birth_certificate")["Gender"], "Female");
  });

  test("a table header does not read the next column as its value", () => {
    const fields = extractFields(LAB_REPORT_TEXT, "lab_report");
    assert.equal(fields["Patient Name"], "MUHAMMAD AHMED KHAN");
    assert.notEqual(fields["Test Name"], "Result");
    assert.notEqual(fields["Result"], "Reference Range");
  });

  test("returns an empty set for noise", () => {
    assert.deepEqual(extractFields(GIBBERISH_TEXT, "other"), {});
    assert.deepEqual(extractFields("", "cnic"), {});
  });

  test("sortFields puts identity fields first", () => {
    const sorted = sortFields({
      "Billing Month": "AUG 2026",
      Name: "ALI",
      "CNIC Number": "1-2",
    }).map(([k]) => k);
    assert.deepEqual(sorted, ["Name", "CNIC Number", "Billing Month"]);
  });
});

describe("expiry detection", () => {
  test("CNIC yields issue and expiry, and the issue date is not the birth date", () => {
    const fields = extractFields(CNIC_TEXT, "cnic");
    const result = detectDates(CNIC_TEXT, "cnic", fields);

    assert.equal(toDateKey(result.expiryDate!), "2030-08-31");
    assert.equal(toDateKey(result.issueDate!), "2020-09-01");
    assert.equal(result.noExpiry, false);
    assert.deepEqual(result.warnings, []);
  });

  test("passport reads month-name expiry", () => {
    const fields = extractFields(PASSPORT_TEXT, "passport");
    const result = detectDates(PASSPORT_TEXT, "passport", fields);
    assert.equal(toDateKey(result.expiryDate!), "2031-03-31");
    assert.equal(toDateKey(result.issueDate!), "2021-04-01");
  });

  test("birth certificate is permanent with no expiry", () => {
    const fields = extractFields(BIRTH_CERTIFICATE_TEXT, "birth_certificate");
    const result = detectDates(BIRTH_CERTIFICATE_TEXT, "birth_certificate", fields);
    assert.equal(result.expiryDate, null);
    assert.equal(result.noExpiry, true);
  });

  test("utility bill due date becomes the expiry", () => {
    const fields = extractFields(UTILITY_BILL_TEXT, "utility_bill");
    const result = detectDates(UTILITY_BILL_TEXT, "utility_bill", fields);
    assert.equal(toDateKey(result.expiryDate!), "2026-09-25");
  });

  test("lease end date becomes the expiry", () => {
    const fields = extractFields(LEASE_TEXT, "lease_agreement");
    const result = detectDates(LEASE_TEXT, "lease_agreement", fields);
    assert.equal(toDateKey(result.expiryDate!), "2027-09-30");
    assert.equal(toDateKey(result.issueDate!), "2026-10-01");
  });

  test("discards an expiry that precedes the issue date", () => {
    const result = detectDates(
      "Date of Issue 01-01-2030\nDate of Expiry 01-01-2020",
      "cnic",
      { "Date of Issue": "01-01-2030", "Date of Expiry": "01-01-2020" },
    );
    assert.equal(result.expiryDate, null);
    assert.equal(result.warnings.length, 1);
  });

  test("never invents an expiry when no label is present", () => {
    const result = detectDates(DEGREE_TEXT, "degree", extractFields(DEGREE_TEXT, "degree"));
    assert.equal(result.expiryDate, null);
  });
});

describe("reconciling the expiry reminder with the dates shown", () => {
  const labelled = (over: Partial<DetectedDate> & { iso: string }): DetectedDate => ({
    role: "expiry",
    raw: over.iso,
    page: 1,
    precision: "day",
    confidence: 0.9,
    evidence: "Coverage until",
    reviewRequired: false,
    reasons: [],
    ...over,
  });

  const policyText =
    "Health Insurance Policy\nDate of Issue 20-11-2025\nCoverage until 19-11-2026\nRenew before 30 November 2026";

  test("a confidently labelled expiry becomes the reminder", () => {
    const detection = detectDates(policyText, "health_insurance", {});
    const { dates, warnings } = reconcileExpiry(detection, [
      labelled({ iso: "2026-11-19", evidence: "Coverage until 19-11-2026", page: 1 }),
    ]);

    assert.equal(toDateKey(detection.expiryDate!), "2026-11-30", "the coarse scan reads the renewal line");
    assert.equal(toDateKey(dates.expiryDate!), "2026-11-19");
    assert.match(dates.expirySource!, /Coverage until/);
    assert.equal(warnings.length, 1, warnings.join(" | "));
    assert.match(warnings[0]!, /2026-11-19/);
    assert.match(warnings[0]!, /2026-11-30/);
  });

  test("names the printed heading in the source, not the whole snippet", () => {
    const dates = reconcileExpiry(detectDates(policyText, "health_insurance", {}), [
      detectLabelledDates([{ page: 1, text: policyText }], {}).find((d) => d.iso === "2026-11-19")!,
    ]);

    assert.equal(dates.dates.expirySource, 'label "Coverage until"');
  });

  test("leaves the reminder alone when both readings agree", () => {
    const detection = detectDates(policyText, "health_insurance", {});
    const { dates, warnings } = reconcileExpiry(detection, [
      labelled({ iso: "2026-11-30", evidence: "Renew before 30 November 2026" }),
    ]);

    assert.equal(dates, detection);
    assert.deepEqual(warnings, []);
  });

  test("reports a disagreeing date that is only a guess instead of using it", () => {
    const detection = detectDates(policyText, "health_insurance", {});
    const { dates, warnings } = reconcileExpiry(detection, [
      labelled({
        iso: "2027-01-05",
        raw: "05/01/2027",
        evidence: "Valid 05/01/2027",
        confidence: 0.55,
        reviewRequired: true,
        reasons: ["day and month order is unclear in this format"],
      }),
    ]);

    assert.equal(toDateKey(dates.expiryDate!), "2026-11-30", "an ambiguous date does not take over");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /2027-01-05/);
  });

  test("refuses an expiry that is not after the issue date", () => {
    const detection = detectDates(policyText, "health_insurance", {});
    const { dates, warnings } = reconcileExpiry(detection, [
      labelled({ iso: "2024-01-01", evidence: "Coverage until 01-01-2024" }),
    ]);

    assert.equal(toDateKey(dates.expiryDate!), "2026-11-30");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /not after the issue date/);
  });
});

describe("local summary", () => {
  test("opens with readable prose, not a lowercased label", () => {
    const typed = summarizeLocally({
      title: "cnic.jpg",
      docType: "cnic",
      category: "identity",
      memberName: null,
      text: CNIC_TEXT,
      fields: {},
    });
    assert.match(typed, /^This is a CNIC, filed under Identity\./);

    const untyped = summarizeLocally({
      title: "scan.jpg",
      docType: "other",
      category: "other",
      memberName: null,
      text: "",
      fields: {},
    });
    assert.match(untyped, /^This is a document of unknown type, filed under Other\./);
  });

  test("describes a CNIC with its real facts", () => {
    const fields = extractFields(CNIC_TEXT, "cnic");
    const dates = detectDates(CNIC_TEXT, "cnic", fields);

    const summary = summarizeLocally({
      title: "cnic-front.jpg",
      docType: "cnic",
      category: "identity",
      memberName: "Ahmed",
      text: CNIC_TEXT,
      fields,
      issueDate: dates.issueDate,
      expiryDate: dates.expiryDate,
    });

    assert.match(summary, /Ahmed/);
    assert.match(summary, /MUHAMMAD AHMED KHAN/);
    assert.match(summary, /31 Aug 2030|2030/);
    assert.match(summary, /Identity/i);
    assert.ok(summary.length > 80, summary);
  });

  test("says plainly when no text could be read", () => {
    const summary = summarizeLocally({
      title: "blank.jpg",
      docType: "other",
      category: "other",
      memberName: null,
      text: "",
      fields: {},
    });
    assert.match(summary, /No readable text/i);
  });

  test("does not quote OCR noise as sentences", () => {
    const summary = summarizeLocally({
      title: "scan.jpg",
      docType: "other",
      category: "other",
      memberName: null,
      text: GIBBERISH_TEXT,
      fields: {},
    });
    assert.ok(!summary.includes("xkcd qzpl"), summary);
  });
});

describe("retrieval", () => {
  const doc = (over: Partial<RetrievalDoc> & { id: string; title: string }): RetrievalDoc => ({
    docType: "other",
    category: "other",
    memberName: null,
    summary: null,
    fields: {},
    text: "",
    issueDate: null,
    expiryDate: null,
    createdAt: new Date("2026-01-01"),
    ...over,
  });

  const vault: RetrievalDoc[] = [
    doc({ id: "1", title: "Ahmed CNIC", docType: "cnic", category: "identity", memberName: "Ahmed", text: CNIC_TEXT, expiryDate: new Date("2030-08-31") }),
    doc({ id: "2", title: "Ahmed Passport", docType: "passport", category: "identity", memberName: "Ahmed", text: PASSPORT_TEXT, expiryDate: new Date("2031-03-31") }),
    doc({ id: "3", title: "LESCO electricity bill August", docType: "utility_bill", category: "property", text: UTILITY_BILL_TEXT, expiryDate: new Date("2026-09-25") }),
    doc({ id: "4", title: "Fatima birth certificate", docType: "birth_certificate", category: "civil", memberName: "Fatima", text: BIRTH_CERTIFICATE_TEXT }),
  ];

  test("ranks the electricity bill first for an expiry question about it", () => {
    const results = scoreDocuments(vault, "when does the electricity bill expire", 3);
    assert.ok(results.length > 0);
    assert.equal(results[0]!.doc.id, "3");
  });

  test("ranks the passport first for a passport question", () => {
    const results = scoreDocuments(vault, "passport number and expiry", 3);
    assert.equal(results[0]!.doc.id, "2");
  });

  test("returns nothing for an unrelated query", () => {
    assert.equal(scoreDocuments(vault, "zzz qqqq zxcvb", 3).length, 0);
  });

  test("returns nothing for an empty query or empty vault", () => {
    assert.equal(scoreDocuments(vault, "the and of", 3).length, 0);
    assert.equal(scoreDocuments([], "passport", 3).length, 0);
  });

  test("produces a snippet around the matched term", () => {
    const [result] = scoreDocuments(vault, "CNIC number", 1);
    assert.match(result!.snippet, /42101|CNIC|Identity/i);
  });
});
