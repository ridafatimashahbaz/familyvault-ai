import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { googleCalendarUrl, icsForEvents, type CalendarEvent } from "@/lib/calendar";

const passport: CalendarEvent = {
  id: "doc-1",
  title: "Passport",
  date: "2026-03-15T00:00:00.000Z",
  memberName: "Ali",
  docTypeLabel: "Passport",
  category: "identity",
  categoryLabel: "Identity",
  expired: false,
  daysToExpiry: 40,
};

const now = new Date("2026-01-02T03:04:05.000Z");

describe("icsForEvents", () => {
  test("wraps events in a valid VCALENDAR with CRLF endings", () => {
    const ics = icsForEvents([passport], { now });
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
    assert.match(ics, /VERSION:2\.0\r\n/);
    assert.match(ics, /PRODID:-\/\/FamilyVault AI\/\/Expiry Calendar\/\/EN\r\n/);
    assert.match(ics, /DTSTAMP:20260102T030405Z\r\n/);
    // RFC 5545: every line break is CRLF, never a bare LF.
    assert.equal(ics.includes("\n"), true);
    assert.equal(/(?<!\r)\n/.test(ics), false);
  });

  test("emits an all-day event whose DTEND is the next day", () => {
    const ics = icsForEvents([passport], { now });
    assert.match(ics, /DTSTART;VALUE=DATE:20260315\r\n/);
    assert.match(ics, /DTEND;VALUE=DATE:20260316\r\n/);
    assert.match(ics, /UID:doc-1@familyvault\r\n/);
    assert.match(ics, /SUMMARY:Passport\r\n/);
  });

  test("adds a seven-day reminder alarm", () => {
    const ics = icsForEvents([passport], { now });
    assert.match(ics, /BEGIN:VALARM\r\nTRIGGER:-P7D\r\nACTION:DISPLAY\r\n/);
  });

  test("links back to the document when a base URL is given", () => {
    const ics = icsForEvents([passport], { now, baseUrl: "https://vault.example" });
    assert.match(ics, /URL:https:\/\/vault\.example\/documents\/doc-1\r\n/);
  });

  test("escapes commas, semicolons and newlines in text fields", () => {
    const ics = icsForEvents([{ ...passport, title: "A, B; C\nD" }], { now });
    assert.match(ics, /SUMMARY:A\\, B\\; C\\nD\r\n/);
  });

  test("folds long lines with a leading space and keeps them within 75 octets", () => {
    const longTitle = "میعاد کی دستاویز ".repeat(20).trim();
    const ics = icsForEvents([{ ...passport, title: longTitle }], { now });
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) {
      assert.ok(encoder.encode(line).length <= 75, `line over 75 octets: ${line}`);
    }
    assert.match(ics, /\r\n /, "expected a folded continuation line");
  });

  test("an empty calendar is still valid", () => {
    const ics = icsForEvents([], { now });
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
    assert.equal(ics.includes("BEGIN:VEVENT"), false);
  });
});

describe("googleCalendarUrl", () => {
  test("builds a prefilled all-day event link", () => {
    const url = new URL(googleCalendarUrl(passport));
    assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
    assert.equal(url.searchParams.get("action"), "TEMPLATE");
    assert.equal(url.searchParams.get("text"), "Passport");
    assert.equal(url.searchParams.get("dates"), "20260315/20260316");
    assert.match(url.searchParams.get("details") ?? "", /Passport/);
  });
});
