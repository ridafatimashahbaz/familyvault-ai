import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return dateFormatter.format(d);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return dateTimeFormatter.format(d);
}

/** Whole days from today until `target`. Negative means already past. */
export function daysUntil(target: Date | string | null | undefined): number | null {
  if (!target) return null;
  const d = typeof target === "string" ? new Date(target) : target;
  if (Number.isNaN(d.getTime())) return null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTarget = new Date(d);
  startOfTarget.setHours(0, 0, 0, 0);

  return Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86_400_000);
}

export type ExpiryState = "expired" | "critical" | "warning" | "ok" | "none";

export function expiryState(
  expiryDate: Date | null,
  warningDays = 60,
): ExpiryState {
  if (!expiryDate) return "none";
  const days = daysUntil(expiryDate);
  if (days === null) return "none";
  if (days < 0) return "expired";
  if (days <= 30) return "critical";
  if (days <= warningDays) return "warning";
  return "ok";
}

export const EXPIRY_STATE_LABEL: Record<ExpiryState, string> = {
  expired: "Expired",
  critical: "Expires soon",
  warning: "Upcoming expiry",
  ok: "Valid",
  none: "No expiry",
};

export function expiryLabel(expiryDate: Date | string | null | undefined): string {
  const days = daysUntil(expiryDate);
  if (days === null) return "No expiry date";
  if (days < 0) return `Expired ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ago`;
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}

export function timeAgo(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86400],
    ["week", 604800],
    ["month", 2592000],
    ["year", 31536000],
  ];

  for (let i = units.length - 1; i >= 0; i--) {
    const [unit, secs] = units[i];
    if (Math.abs(seconds) >= secs || i === 0) {
      return rtf.format(Math.round(seconds / secs), unit);
    }
  }
  return "just now";
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export function stripExtension(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i > 0 ? filename.slice(0, i) : filename;
}

/** Turns a raw file name into a readable document title. */
export function titleFromFilename(filename: string): string {
  return stripExtension(filename)
    .replace(/[_]+/g, " ")
    .replace(/-(\w)/g, " $1")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
