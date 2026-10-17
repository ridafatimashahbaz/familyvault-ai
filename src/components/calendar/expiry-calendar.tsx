"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  bucketByDay,
  buildMonthGrid,
  monthLabel,
  shiftMonth,
  todayKey,
  urgencyOf,
  weekdayLabels,
  type CalendarEvent,
  type CalendarUrgency,
} from "@/lib/calendar";
import { useLocale } from "@/components/locale-provider";
import { CalendarDayPanel } from "@/components/calendar/calendar-day-panel";

const DOT_TONE: Record<CalendarUrgency, string> = {
  expired: "bg-danger",
  soon: "bg-warning",
  valid: "bg-success",
};

const CELL_TONE: Record<CalendarUrgency, string> = {
  expired: "bg-danger-surface ring-danger-border",
  soon: "bg-warning-surface ring-warning-border",
  valid: "bg-success-surface ring-success-border",
};

/**
 * The month grid. Month navigation and day selection live in local state so
 * switching months is instant; the whole vault of expiry dates is already on the
 * client. Today is ringed, days with expiries are tinted by urgency, and the
 * selected day's rows render underneath.
 */
export function ExpiryCalendar({
  events,
  initialYear,
  initialMonth,
  soonDays = 30,
}: {
  events: CalendarEvent[];
  initialYear: number;
  initialMonth: number;
  soonDays?: number;
}) {
  const { t, locale } = useLocale();
  const intlLocale = locale === "ur" ? "ur" : "en-GB";

  const [{ year, month }, setMonth] = useState({ year: initialYear, month: initialMonth });
  const today = todayKey();

  const buckets = useMemo(() => bucketByDay(events, soonDays), [events, soonDays]);
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const weekdays = useMemo(() => weekdayLabels(intlLocale), [intlLocale]);

  const [selected, setSelected] = useState<string>(() => {
    if (buckets.has(today)) return today;
    const inMonth = cells.find((cell) => cell.inMonth && buckets.has(cell.key));
    return inMonth?.key ?? today;
  });

  const dayEvents = buckets.get(selected) ?? [];
  const go = (delta: number) => setMonth((current) => shiftMonth(current.year, current.month, delta));
  const goToday = () => {
    const now = new Date();
    setMonth({ year: now.getFullYear(), month: now.getMonth() + 1 });
    setSelected(today);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="rounded-card border border-ink-200/80 bg-surface shadow-card">
        <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-3 py-3 sm:px-4">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label={t.calendar.prevMonth}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-ink-200 text-ink-600 transition-colors hover:bg-ink-50"
          >
            <ChevronLeft className="size-4 flip-rtl" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink-900">
              {monthLabel(year, month, intlLocale)}
            </h2>
            <button
              type="button"
              onClick={goToday}
              className="rounded-md border border-ink-200 px-2 py-0.5 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-50"
            >
              {t.calendar.today}
            </button>
          </div>

          <button
            type="button"
            onClick={() => go(1)}
            aria-label={t.calendar.nextMonth}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-ink-200 text-ink-600 transition-colors hover:bg-ink-50"
          >
            <ChevronRight className="size-4 flip-rtl" aria-hidden="true" />
          </button>
        </div>

        <div className="p-3 sm:p-4">
          <div className="grid grid-cols-7 gap-1 pb-1">
            {weekdays.map((label) => (
              <div key={label} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              const dayEventsForCell = buckets.get(cell.key) ?? [];
              const top = dayEventsForCell[0];
              const urgency = top ? urgencyOf(top, soonDays) : null;
              const isToday = cell.key === today;
              const isSelected = cell.key === selected;
              const count = dayEventsForCell.length;

              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelected(cell.key)}
                  aria-current={isToday ? "date" : undefined}
                  aria-pressed={isSelected}
                  className={cn(
                    "relative flex aspect-square flex-col items-center justify-center gap-1 rounded-lg text-sm transition-colors",
                    cell.inMonth ? "text-ink-700" : "text-ink-300",
                    urgency ? CELL_TONE[urgency] : "hover:bg-ink-50",
                    isSelected && "ring-2 ring-brand-500",
                    isToday && !isSelected && "ring-1 ring-ink-300",
                  )}
                >
                  <span className={cn(isToday && "font-semibold text-ink-900")}>{cell.day}</span>
                  {count > 0 ? (
                    <span className="flex items-center gap-0.5">
                      {Array.from({ length: Math.min(count, 3) }).map((_, index) => (
                        <span
                          key={index}
                          className={cn("size-1.5 rounded-full", urgency ? DOT_TONE[urgency] : "bg-ink-400")}
                        />
                      ))}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-100 pt-3 text-xs text-ink-500">
            <Legend tone="bg-danger" label={t.calendar.legendExpired} />
            <Legend tone="bg-warning" label={t.calendar.legendSoon} />
            <Legend tone="bg-success" label={t.calendar.legendValid} />
          </div>
        </div>
      </div>

      <CalendarDayPanel dateKey={selected} events={dayEvents} soonDays={soonDays} />
    </div>
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-full", tone)} aria-hidden="true" />
      {label}
    </span>
  );
}
