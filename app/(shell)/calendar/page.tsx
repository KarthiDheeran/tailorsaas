"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  IndianRupee,
  Scissors,
  Send,
  Truck,
} from "lucide-react";
import {
  getCalendarDataAction,
  markReminderSentAction,
} from "@/app/(shell)/calendar/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";
import { cn } from "@/lib/utils";
import type { CalendarData, CalendarEvent, CalendarEventType } from "@/lib/calendar";

type CalendarMode = "today" | "week" | "month";

const EVENT_FILTERS: { type: CalendarEventType; label: string }[] = [
  { type: "Delivery", label: "Deliveries" },
  { type: "Trial", label: "Trials" },
  { type: "Production", label: "Production" },
  { type: "Payment", label: "Payments" },
];

const EVENT_ICONS = {
  Delivery: Truck,
  Trial: CalendarDays,
  Production: Scissors,
  Payment: IndianRupee,
} as const;

const EVENT_TONES = {
  blue: "border-chip-blue bg-chip-blue text-chip-blue-fg",
  green: "border-chip-mint bg-chip-mint text-chip-mint-fg",
  amber: "border-chip-peach bg-chip-peach text-chip-peach-fg",
  red: "border-chip-red bg-chip-red text-chip-red-fg",
  slate: "border-border bg-surface text-ink-muted",
} as const;

function CalendarContent() {
  const [mode, setMode] = useState<CalendarMode>("week");
  const [anchorDate, setAnchorDate] = useState(() => todayIso());
  const [enabledTypes, setEnabledTypes] = useState<CalendarEventType[]>([
    "Delivery",
    "Trial",
    "Production",
    "Payment",
  ]);
  const [data, setData] = useState<CalendarData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingEventKey, setPendingEventKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const range = useMemo(() => getRange(mode, anchorDate), [mode, anchorDate]);
  const days = useMemo(() => enumerateDays(range.startDate, range.endDate), [range]);

  useEffect(() => {
    let cancelled = false;
    getCalendarDataAction({
      startDate: range.startDate,
      endDate: range.endDate,
      todayIso: todayIso(),
    })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Failed to load calendar."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range.startDate, range.endDate, refreshKey]);

  const visibleEvents = useMemo(() => {
    const allowed = new Set(enabledTypes);
    return (data?.events ?? []).filter((event) => allowed.has(event.type));
  }, [data?.events, enabledTypes]);

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    for (const day of days) grouped.set(day, []);
    for (const event of visibleEvents) {
      grouped.get(event.date)?.push(event);
    }
    return grouped;
  }, [days, visibleEvents]);

  const counts = useMemo(() => {
    return {
      total: visibleEvents.length,
      pastDue: visibleEvents.filter((event) => event.isPastDue).length,
      remindersSent: visibleEvents.filter((event) => event.reminderSentAt).length,
    };
  }, [visibleEvents]);

  function shiftRange(direction: -1 | 1) {
    const delta = mode === "month" ? direction * 30 : mode === "week" ? direction * 7 : direction;
    setAnchorDate(addDays(anchorDate, delta));
  }

  function toggleType(type: CalendarEventType) {
    setEnabledTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type]
    );
  }

  function markSent(event: CalendarEvent) {
    setPendingEventKey(event.eventKey);
    startTransition(async () => {
      const result = await markReminderSentAction({
        eventKey: event.eventKey,
        reminderType: event.reminderType,
        targetType: event.reminderTargetType,
        targetId: event.reminderTargetId,
        reminderDate: event.date,
        message: event.reminderMessage,
      });
      setPendingEventKey(null);
      if (!result.success) {
        window.alert(result.error);
        return;
      }
      setRefreshKey((key) => key + 1);
    });
  }

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Calendar</h1>
          <p className="text-sm text-ink-muted">
            Trials, deliveries, production due dates, and payment follow-ups.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftRange(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-ink-muted hover:bg-surface"
            aria-label="Previous range"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setAnchorDate(todayIso());
              setMode("today");
            }}
            className="h-10 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink-muted hover:bg-surface"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shiftRange(1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-ink-muted hover:bg-surface"
            aria-label="Next range"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-y border-border-soft py-3">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-white p-1">
          {(["today", "week", "month"] as CalendarMode[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={cn(
                "h-8 rounded-md px-3 text-xs font-semibold capitalize transition-colors",
                mode === item
                  ? "bg-primary text-white"
                  : "text-ink-muted hover:bg-surface hover:text-ink"
              )}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {EVENT_FILTERS.map((filter) => (
            <label
              key={filter.type}
              className="flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-ink-muted"
            >
              <input
                type="checkbox"
                checked={enabledTypes.includes(filter.type)}
                onChange={() => toggleType(filter.type)}
                className="h-3.5 w-3.5 accent-primary"
              />
              {filter.label}
            </label>
          ))}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryStat icon={ClipboardList} label="Visible Events" value={counts.total} />
        <SummaryStat icon={Clock} label="Needs Attention" value={counts.pastDue} warning={counts.pastDue > 0} />
        <SummaryStat icon={Bell} label="Reminders Sent" value={counts.remindersSent} />
      </div>

      {loadError && (
        <div className="mb-5">
          <LoadError message={loadError} onRetry={() => setRefreshKey((key) => key + 1)} />
        </div>
      )}

      {data && !data.remindersEnabled && (
        <div className="mb-5 rounded-lg border border-chip-peach bg-chip-peach px-4 py-3 text-sm font-medium text-chip-peach-fg">
          Reminder tracking migration is pending. Calendar events are visible, but sent-status cannot be saved yet.
        </div>
      )}

      {!data && !loadError ? (
        <LoadingState label="Loading calendar..." />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-7">
          {days.map((day) => {
            const dayEvents = eventsByDate.get(day) ?? [];
            return (
              <section
                key={day}
                className={cn(
                  "min-h-[220px] border border-border-soft bg-white",
                  day === todayIso() ? "ring-2 ring-primary/30" : ""
                )}
              >
                <div className="border-b border-border-soft px-4 py-3">
                  <div className="text-xs font-semibold uppercase text-ink-faint">
                    {formatWeekday(day)}
                  </div>
                  <div className="text-sm font-semibold text-ink">{formatShortDate(day)}</div>
                </div>
                <div className="space-y-2 p-3">
                  {dayEvents.length === 0 ? (
                    <div className="flex h-24 items-center justify-center text-center text-xs text-ink-faint">
                      No events
                    </div>
                  ) : (
                    dayEvents.map((event) => (
                      <CalendarEventItem
                        key={event.id}
                        event={event}
                        remindersEnabled={data?.remindersEnabled ?? false}
                        pending={isPending && pendingEventKey === event.eventKey}
                        onMarkSent={markSent}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  warning,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 border border-border-soft bg-white px-4 py-3 shadow-soft">
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg",
          warning ? "bg-chip-red text-chip-red-fg" : "bg-primary-tint text-primary"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs font-medium text-ink-muted">{label}</div>
        <div className="text-xl font-semibold text-ink">{value}</div>
      </div>
    </div>
  );
}

function CalendarEventItem({
  event,
  remindersEnabled,
  pending,
  onMarkSent,
}: {
  event: CalendarEvent;
  remindersEnabled: boolean;
  pending: boolean;
  onMarkSent: (event: CalendarEvent) => void;
}) {
  const Icon = EVENT_ICONS[event.type];
  return (
    <article className="border border-border-soft bg-white p-3 shadow-soft">
      <div className="mb-2 flex items-start gap-2">
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
            EVENT_TONES[event.tone]
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{event.title}</div>
          <div className="line-clamp-2 text-xs text-ink-muted">{event.subtitle}</div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-surface px-2 py-1 text-[11px] font-semibold text-ink-muted">
          {event.type}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-1 text-[11px] font-semibold",
            event.isPastDue ? "bg-chip-red text-chip-red-fg" : "bg-surface text-ink-muted"
          )}
        >
          {event.status}
        </span>
        {event.priority && (
          <span className="rounded-full bg-surface px-2 py-1 text-[11px] font-semibold text-ink-muted">
            {event.priority}
          </span>
        )}
      </div>

      {event.assignedTo && (
        <div className="mb-3 truncate text-xs text-ink-muted">
          Assigned to {event.assignedTo}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Link
          href={event.jobCardId ? "/job-cards" : "/orders"}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Open
        </Link>
        {event.reminderSentAt ? (
          <span className="text-xs font-semibold text-chip-mint-fg">Sent</span>
        ) : (
          <button
            type="button"
            onClick={() => onMarkSent(event)}
            disabled={!remindersEnabled || pending}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold text-ink-muted hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {pending ? "Saving" : "Mark sent"}
          </button>
        )}
      </div>
    </article>
  );
}

export default function CalendarPage() {
  return (
    <RequirePermission permission="calendar.view">
      <CalendarContent />
    </RequirePermission>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function getRange(mode: CalendarMode, anchorDate: string): { startDate: string; endDate: string } {
  if (mode === "today") return { startDate: anchorDate, endDate: anchorDate };
  if (mode === "week") {
    const date = parseIso(anchorDate);
    const day = date.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = addDays(anchorDate, mondayOffset);
    return { startDate: start, endDate: addDays(start, 6) };
  }

  const date = parseIso(anchorDate);
  const start = toIso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
  const end = toIso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
  return { startDate: start, endDate: end };
}

function enumerateDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  let current = startDate;
  while (current <= endDate) {
    days.push(current);
    current = addDays(current, 1);
  }
  return days;
}

function addDays(iso: string, days: number): string {
  const date = parseIso(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

function parseIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatShortDate(iso: string): string {
  return parseIso(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

function formatWeekday(iso: string): string {
  return parseIso(iso).toLocaleDateString("en-IN", { weekday: "short" });
}
