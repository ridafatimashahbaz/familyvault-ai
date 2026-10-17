/**
 * Calendar builders.
 *
 * Everything here is pure so the month grid, the day bucketing and the RFC 5545
 * output can be unit-tested without a browser, a database or a request.
 *
 * Expiry dates are date-only values stored at UTC midnight, so the date part of
 * the ISO string is used everywhere and nothing shifts by timezone. Events are
 * all-day, which keeps an imported .ics correct in any calendar app.
 */

export type CalendarEvent = {
  id: string;
  title: string;
  /** ISO timestamp; only the date part is used. */
  date: string;
  memberName: string | null;
  docTypeLabel: string;
  category: string;
  categoryLabel: string;
  expired: boolean;
  daysToExpiry: number | null;
};

export type CalendarUrgency = "expired" | "soon" | "valid";

export type CalendarCell = {
  /** YYYY-MM-DD of the cell. */
  key: string;
  day: number;
  /** False for the leading/trailing days borrowed from the neighbouring months. */
  inMonth: boolean;
};

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function keyOf(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The date part of a date or ISO string. */
export function dayKey(value: string | Date): string {
  const iso = typeof value === "string" ? value : value.toISOString();
  return iso.slice(0, 10);
}

export function addDays(value: string | Date, days: number): string {
  const [year, month, day] = dayKey(value).split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return keyOf(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Parses a `YYYY-MM` string; anything else is ignored. */
export function parseMonthKey(value: string | null | undefined): { year: number; month: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 1900 || year > 2200) return null;
  return { year, month };
}

export function monthKey(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

export function monthLabel(year: number, month: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

/** Monday-first short weekday names, for the grid header. */
export function weekdayLabels(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  // 2024-01-01 is a Monday, so offsetting from it keeps the week Monday-first.
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(Date.UTC(2024, 0, 1 + index))),
  );
}

export function todayKey(now: Date = new Date()): string {
  return keyOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Six weeks (42 cells) starting on the Monday on or before the 1st. */
export function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const previous = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const leading = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const total = daysInMonth(year, month);

  const cells: CalendarCell[] = [];

  for (let offset = leading; offset > 0; offset -= 1) {
    const day = daysInMonth(previous.year, previous.month) - offset + 1;
    cells.push({ key: keyOf(previous.year, previous.month, day), day, inMonth: false });
  }
  for (let day = 1; day <= total; day += 1) {
    cells.push({ key: keyOf(year, month, day), day, inMonth: true });
  }

  let day = 1;
  while (cells.length < 42) {
    cells.push({ key: keyOf(next.year, next.month, day), day, inMonth: false });
    day += 1;
  }

  return cells;
}

export function urgencyOf(event: CalendarEvent, soonDays = 30): CalendarUrgency {
  if (event.expired) return "expired";
  if (event.daysToExpiry !== null && event.daysToExpiry <= soonDays) return "soon";
  return "valid";
}

/** Groups events by their date part, each day sorted by urgency then title. */
export function bucketByDay(events: CalendarEvent[], soonDays = 30): Map<string, CalendarEvent[]> {
  const rank: Record<CalendarUrgency, number> = { expired: 0, soon: 1, valid: 2 };
  const buckets = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const key = dayKey(event.date);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(event);
    else buckets.set(key, [event]);
  }

  for (const bucket of buckets.values()) {
    bucket.sort(
      (a, b) =>
        rank[urgencyOf(a, soonDays)] - rank[urgencyOf(b, soonDays)] ||
        a.title.localeCompare(b.title),
    );
  }

  return buckets;
}

/** Turns a decorated document row into a calendar event, or null if it has no date. */
export function toCalendarEvent(doc: {
  id: string;
  title: string;
  expiryDate: string | null;
  docTypeLabel: string;
  category: string;
  categoryLabel: string;
  familyMember: { name: string } | null;
  isExpired: boolean;
  daysToExpiry: number | null;
}): CalendarEvent | null {
  if (!doc.expiryDate) return null;
  return {
    id: doc.id,
    title: doc.title,
    date: doc.expiryDate,
    memberName: doc.familyMember?.name ?? null,
    docTypeLabel: doc.docTypeLabel,
    category: doc.category,
    categoryLabel: doc.categoryLabel,
    expired: doc.isExpired,
    daysToExpiry: doc.daysToExpiry,
  };
}

/* --------------------------------------------------------------------- .ics */

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545: content lines are folded at 75 octets with a leading space. */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = "";
  let bytes = 0;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 74 && current.length > 0) {
      parts.push(current);
      current = char;
      bytes = size;
    } else {
      current += char;
      bytes += size;
    }
  }
  if (current) parts.push(current);

  return parts.join("\r\n ");
}

function icsDate(value: string | Date): string {
  return dayKey(value).replace(/-/g, "");
}

function icsTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export type IcsOptions = {
  now?: Date;
  /** Absolute site origin, used to link each event back to its document. */
  baseUrl?: string;
  calendarName?: string;
};

/**
 * A minimal but valid calendar of all-day expiry events, each with a
 * seven-day-before alarm. Line endings are CRLF and long lines are folded, as
 * the format requires.
 */
export function icsForEvents(events: CalendarEvent[], options: IcsOptions = {}): string {
  const stamp = icsTimestamp(options.now ?? new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FamilyVault AI//Expiry Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  if (options.calendarName) {
    lines.push(`X-WR-CALNAME:${escapeIcsText(options.calendarName)}`);
  }

  for (const event of events) {
    const detail = [
      event.docTypeLabel,
      event.memberName,
      event.expired ? "Expired" : "Expires",
    ]
      .filter(Boolean)
      .join(" · ");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcsText(event.id)}@familyvault`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${icsDate(event.date)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(event.date, 1))}`);
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(detail)}`);
    if (event.categoryLabel) lines.push(`CATEGORIES:${escapeIcsText(event.categoryLabel)}`);
    if (options.baseUrl) lines.push(`URL:${options.baseUrl}/documents/${event.id}`);
    lines.push("BEGIN:VALARM");
    lines.push("TRIGGER:-P7D");
    lines.push("ACTION:DISPLAY");
    lines.push(`DESCRIPTION:${escapeIcsText(event.title)}`);
    lines.push("END:VALARM");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** A prefilled "add to Google Calendar" link — no OAuth, no API key. */
export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${icsDate(event.date)}/${icsDate(addDays(event.date, 1))}`,
    details: [event.docTypeLabel, event.memberName].filter(Boolean).join(" · "),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
