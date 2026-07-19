"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  IndianRupee,
  MoreHorizontal,
  Scissors,
  Send,
  Truck,
  X,
} from "lucide-react";
import {
  getCalendarDataAction,
  markReminderSentAction,
} from "@/app/(shell)/calendar/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { cn } from "@/lib/utils";
import type { CalendarData, CalendarEvent, CalendarEventType } from "@/lib/calendar";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

type CalendarMode = "today" | "week" | "month";

const EVENT_FILTERS: { type: CalendarEventType; label: string }[] = [
  { type: "Delivery", label: "Deliveries" },
  { type: "Pickup", label: "Pickups" },
  { type: "Trial", label: "Trials" },
  { type: "Production", label: "Production" },
  { type: "Payment", label: "Payments" },
];

const EVENT_ICONS = {
  Delivery: Truck,
  Pickup: Truck,
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
    "Pickup",
    "Trial",
    "Production",
    "Payment",
  ]);
  const [hideCancelled, setHideCancelled] = useState(true);
  const [staffFilter, setStaffFilter] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
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

  useEffect(() => {
    if (!selectedEvent) return;
    const latestEvent = data?.events.find((event) => event.eventKey === selectedEvent.eventKey);
    if (latestEvent) setSelectedEvent(latestEvent);
  }, [data?.events, selectedEvent]);

  const visibleEvents = useMemo(() => {
    const allowed = new Set(enabledTypes);
    return (data?.events ?? []).filter((event) => {
      if (!allowed.has(event.type)) return false;
      if (hideCancelled && isCancelledEvent(event)) return false;
      if (staffFilter === "all") return true;
      return event.assignedTo === staffFilter;
    });
  }, [data?.events, enabledTypes, hideCancelled, staffFilter]);

  const staffOptions = useMemo(() => {
    return Array.from(
      new Set(
        (data?.events ?? [])
          .map((event) => event.assignedTo)
          .filter((value): value is string => Boolean(value && value !== "Unassigned"))
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [data?.events]);

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

  function clearFilters() {
    setEnabledTypes(EVENT_FILTERS.map((filter) => filter.type));
    setStaffFilter("all");
    setHideCancelled(true);
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
        phone: event.customerPhone,
      });
      setPendingEventKey(null);
      if (!result.success) {
        window.alert(result.error);
        return;
      }
      setRefreshKey((key) => key + 1);
    });
  }

  const pendingSelectedEvent =
    Boolean(selectedEvent) && isPending && pendingEventKey === selectedEvent?.eventKey;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
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
          {staffOptions.length > 0 && (
            <div className="relative">
              <select
                value={staffFilter}
                onChange={(event) => setStaffFilter(event.target.value)}
                className="h-9 min-w-[160px] appearance-none rounded-lg border border-border bg-white py-0 pl-3 pr-10 text-xs font-semibold leading-9 text-ink-muted outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              >
                <option value="all">All staff</option>
                {staffOptions.map((staffName) => (
                  <option key={staffName} value={staffName}>
                    {staffName}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            </div>
          )}
          {EVENT_FILTERS.map((filter) => {
            const active = enabledTypes.includes(filter.type);
            return (
              <button
                key={filter.type}
                type="button"
                onClick={() => toggleType(filter.type)}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
                  active
                    ? "border-primary bg-primary-tint text-primary"
                    : "border-border bg-white text-ink-muted hover:bg-surface"
                )}
                aria-pressed={active}
              >
                {active && <Check className="h-3.5 w-3.5" />}
                {filter.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setHideCancelled((current) => !current)}
            className={cn(
              "h-9 rounded-full border px-3 text-xs font-semibold transition-colors",
              hideCancelled
                ? "border-primary bg-primary-tint text-primary"
                : "border-border bg-white text-ink-muted hover:bg-surface"
            )}
            aria-pressed={hideCancelled}
          >
            Hide cancelled
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="h-9 rounded-full border border-border bg-white px-3 text-xs font-semibold text-ink-muted hover:bg-surface"
          >
            Clear filters
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3 border border-border-soft bg-white px-4 py-3">
        <SummaryPill icon={Clock} label="Needs Attention" value={counts.pastDue} warning={counts.pastDue > 0} />
        <SummaryPill icon={Bell} label="Reminders Sent" value={counts.remindersSent} />
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
      ) : mode === "today" ? (
        <TodayAgenda
          day={anchorDate}
          events={visibleEvents}
          remindersEnabled={data?.remindersEnabled ?? false}
          pendingEventKey={isPending ? pendingEventKey : null}
          onSelectEvent={setSelectedEvent}
          onMarkSent={markSent}
        />
      ) : mode === "month" ? (
        <MonthView days={days} eventsByDate={eventsByDate} onSelectEvent={setSelectedEvent} />
      ) : (
        <WeekView
          days={days}
          eventsByDate={eventsByDate}
          remindersEnabled={data?.remindersEnabled ?? false}
          pendingEventKey={isPending ? pendingEventKey : null}
          onSelectEvent={setSelectedEvent}
          onMarkSent={markSent}
        />
      )}

      {selectedEvent && (
        <CalendarEventDrawer
          event={selectedEvent}
          remindersEnabled={data?.remindersEnabled ?? false}
          pending={pendingSelectedEvent}
          onClose={() => setSelectedEvent(null)}
          onMarkSent={markSent}
        />
      )}
    </div>
  );
}

function SummaryPill({
  icon: Icon,
  label,
  value,
  warning,
}: {
  icon: typeof Clock;
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg",
          warning ? "bg-chip-red text-chip-red-fg" : "bg-primary-tint text-primary"
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-sm text-ink-muted">
        {label}: <span className="font-semibold text-ink">{value}</span>
      </div>
    </div>
  );
}

function WeekView({
  days,
  eventsByDate,
  remindersEnabled,
  pendingEventKey,
  onSelectEvent,
  onMarkSent,
}: {
  days: string[];
  eventsByDate: Map<string, CalendarEvent[]>;
  remindersEnabled: boolean;
  pendingEventKey: string | null;
  onSelectEvent: (event: CalendarEvent) => void;
  onMarkSent: (event: CalendarEvent) => void;
}) {
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  return (
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
            <DayHeader day={day} />
            <div className="space-y-2 p-3">
              {dayEvents.length === 0 ? (
                <EmptyDay />
              ) : (
                dayEvents.map((event) => (
                  <CompactEventCard
                    key={event.id}
                    event={event}
                    menuOpen={openMenuKey === event.eventKey}
                    remindersEnabled={remindersEnabled}
                    pending={pendingEventKey === event.eventKey}
                    onSelect={() => onSelectEvent(event)}
                    onMarkSent={() => onMarkSent(event)}
                    onMenuToggle={() =>
                      setOpenMenuKey((current) =>
                        current === event.eventKey ? null : event.eventKey
                      )
                    }
                    onMenuClose={() => setOpenMenuKey(null)}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TodayAgenda({
  day,
  events,
  remindersEnabled,
  pendingEventKey,
  onSelectEvent,
  onMarkSent,
}: {
  day: string;
  events: CalendarEvent[];
  remindersEnabled: boolean;
  pendingEventKey: string | null;
  onSelectEvent: (event: CalendarEvent) => void;
  onMarkSent: (event: CalendarEvent) => void;
}) {
  return (
    <section className="border border-border-soft bg-white">
      <div className="border-b border-border-soft px-4 py-3">
        <div className="text-xs font-semibold uppercase text-ink-faint">
          {day === todayIso() ? "Today" : formatWeekday(day)}
        </div>
        <div className="text-sm font-semibold text-ink">{formatLongDate(day)}</div>
      </div>
      <div className="divide-y divide-border-soft">
        {events.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center text-sm text-ink-faint">
            No events today
          </div>
        ) : (
          events.map((event) => (
            <AgendaRow
              key={event.id}
              event={event}
              remindersEnabled={remindersEnabled}
              pending={pendingEventKey === event.eventKey}
              onSelect={() => onSelectEvent(event)}
              onMarkSent={() => onMarkSent(event)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function MonthView({
  days,
  eventsByDate,
  onSelectEvent,
}: {
  days: string[];
  eventsByDate: Map<string, CalendarEvent[]>;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  const leadingBlanks = parseIso(days[0] ?? todayIso()).getUTCDay();
  const blanks = Array.from({ length: leadingBlanks });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {blanks.map((_, index) => (
        <div key={`blank:${index}`} className="hidden min-h-[132px] lg:block" />
      ))}
      {days.map((day) => {
        const dayEvents = eventsByDate.get(day) ?? [];
        const groupedCounts = getTypeCounts(dayEvents);
        const needsAttention = dayEvents.filter((event) => event.isPastDue).length;
        const isToday = day === todayIso();
        return (
          <section
            key={day}
            className={cn(
              "min-h-[132px] border border-border-soft bg-white p-3",
              isToday ? "ring-2 ring-primary/30" : ""
            )}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase text-ink-faint">
                  {formatWeekday(day)}
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-ink">{formatShortDate(day)}</div>
                  {isToday && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">
                      Today
                    </span>
                  )}
                </div>
              </div>
              {needsAttention > 0 && (
                <span className="rounded-full bg-chip-red px-2 py-1 text-[11px] font-semibold text-chip-red-fg">
                  {needsAttention} overdue
                </span>
              )}
            </div>
            {dayEvents.length === 0 ? (
              <div className="text-xs text-ink-faint">No events</div>
            ) : (
              <div className="space-y-1.5">
                {groupedCounts.map(({ type, count }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      const firstEvent = dayEvents.find((event) => event.type === type);
                      if (firstEvent) onSelectEvent(firstEvent);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs font-semibold text-ink-muted hover:bg-surface"
                  >
                    <span>{pluralizeType(type, count)}</span>
                    <span className="text-ink">{count}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function AgendaRow({
  event,
  remindersEnabled,
  pending,
  onSelect,
  onMarkSent,
}: {
  event: CalendarEvent;
  remindersEnabled: boolean;
  pending: boolean;
  onSelect: () => void;
  onMarkSent: () => void;
}) {
  const Icon = EVENT_ICONS[event.type];
  return (
    <div className={cn("grid gap-3 px-4 py-3 sm:grid-cols-[110px_1fr_auto]", isCancelledEvent(event) && "opacity-60")}>
      <div className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
        <Clock className="h-4 w-4" />
        {event.type}
      </div>
      <button type="button" onClick={onSelect} className="min-w-0 text-left">
        <div className="flex items-center gap-2">
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", EVENT_TONES[event.tone])}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink">{displayEventId(event)}</div>
            <div className="truncate text-xs text-ink-muted">{compactSubtitle(event)}</div>
          </div>
        </div>
      </button>
      <div className="flex items-center gap-2">
        <CriticalBadge event={event} />
        {!event.reminderSentAt && (
          <button
            type="button"
            onClick={onMarkSent}
            disabled={!remindersEnabled || pending}
            className="flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-semibold text-ink-muted hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {pending ? "Saving" : "Mark sent"}
          </button>
        )}
      </div>
    </div>
  );
}

function CompactEventCard({
  event,
  menuOpen,
  remindersEnabled,
  pending,
  onSelect,
  onMarkSent,
  onMenuToggle,
  onMenuClose,
}: {
  event: CalendarEvent;
  menuOpen: boolean;
  remindersEnabled: boolean;
  pending: boolean;
  onSelect: () => void;
  onMarkSent: () => void;
  onMenuToggle: () => void;
  onMenuClose: () => void;
}) {
  const Icon = EVENT_ICONS[event.type];
  const recordHref = getRecordHref(event);
  return (
    <article
      className={cn(
        "relative border border-border-soft bg-white p-2.5 shadow-soft transition hover:border-primary/40 hover:bg-surface",
        isCancelledEvent(event) && "opacity-55"
      )}
    >
      <div className="mb-2 flex items-start gap-2">
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
            EVENT_TONES[event.tone]
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
          <div className="break-words text-sm font-semibold leading-5 text-ink">
            {displayEventId(event)}
          </div>
        </button>
        <button
          type="button"
          onClick={onMenuToggle}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint hover:bg-white hover:text-ink-muted"
          aria-label={`${event.type} actions`}
          aria-expanded={menuOpen}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={onSelect}
        className="mb-1 line-clamp-2 w-full text-left text-xs leading-4 text-ink-muted"
      >
        {event.customerName ?? event.type}
      </button>
      <button type="button" onClick={onSelect} className="mb-2 line-clamp-2 w-full text-left text-xs leading-4 text-ink-muted">
        {shortEventLabel(event)}
      </button>
      <CriticalBadge event={event} />

      {menuOpen && (
        <div className="absolute right-2 top-10 z-20 w-44 rounded-lg border border-border bg-white p-1 shadow-soft">
          <button
            type="button"
            onClick={() => {
              onMenuClose();
              onSelect();
            }}
            className="block w-full rounded-md px-3 py-2 text-left text-xs font-semibold text-ink-muted hover:bg-surface"
          >
            View details
          </button>
          <Link
            href={recordHref}
            onClick={onMenuClose}
            className="block rounded-md px-3 py-2 text-xs font-semibold text-ink-muted hover:bg-surface"
          >
            {getOpenRecordLabel(event)}
          </Link>
          {event.reminderSentAt ? (
            <div className="rounded-md px-3 py-2 text-xs font-semibold text-chip-mint-fg">
              Reminder sent
            </div>
          ) : event.customerPhone && event.whatsappEnabled ? (
            <a
              href={buildWhatsAppUrl(event.customerPhone, event.reminderMessage)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(clickEvent) => {
                if (!remindersEnabled || pending) {
                  clickEvent.preventDefault();
                  return;
                }
                onMenuClose();
                onMarkSent();
              }}
              className={cn(
                "block rounded-md px-3 py-2 text-xs font-semibold text-ink-muted hover:bg-surface",
                (!remindersEnabled || pending) && "pointer-events-none opacity-50"
              )}
            >
              {pending ? "Saving" : "WhatsApp customer"}
            </a>
          ) : event.customerPhone && !event.whatsappEnabled ? (
            <div className="rounded-md px-3 py-2 text-xs font-semibold text-ink-faint">
              WhatsApp off
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                onMenuClose();
                onMarkSent();
              }}
              disabled={!remindersEnabled || pending}
              className="block w-full rounded-md px-3 py-2 text-left text-xs font-semibold text-ink-muted hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Saving" : "Mark reminder sent"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function CalendarEventDrawer({
  event,
  remindersEnabled,
  pending,
  onClose,
  onMarkSent,
}: {
  event: CalendarEvent;
  remindersEnabled: boolean;
  pending: boolean;
  onClose: () => void;
  onMarkSent: (event: CalendarEvent) => void;
}) {
  const Icon = EVENT_ICONS[event.type];
  const recordHref = getRecordHref(event);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25" role="dialog" aria-modal="true">
      <button type="button" className="flex-1 cursor-default" aria-label="Close details" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="border-b border-border-soft px-5 py-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border", EVENT_TONES[event.tone])}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold text-ink">{event.title}</div>
                <div className="text-sm text-ink-muted">{event.type} on {formatLongDate(event.date)}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-ink-muted hover:bg-surface"
              aria-label="Close details"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <CriticalBadge event={event} />
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <DetailGroup
            rows={[
              ["Customer", event.customerName],
              ["Phone", event.customerPhone],
              ["Order", event.orderNumber],
              ["Job card", event.jobCardNumber],
              ["Staff", event.assignedTo],
              ["Status", event.status],
              ["Priority", event.priority],
              ["Details", event.subtitle],
            ]}
          />
          <div>
            <div className="mb-2 text-xs font-semibold uppercase text-ink-faint">Reminder</div>
            <div className="rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm text-ink-muted">
              {event.reminderMessage}
            </div>
          </div>
        </div>

        <div className="space-y-2 border-t border-border-soft p-4">
          <Link
            href={recordHref}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            Open record
          </Link>
          {event.reminderSentAt ? (
            <div className="flex h-10 items-center justify-center rounded-lg border border-border bg-surface text-sm font-semibold text-chip-mint-fg">
              Reminder sent
            </div>
          ) : event.customerPhone && event.whatsappEnabled ? (
            <a
              href={buildWhatsAppUrl(event.customerPhone, event.reminderMessage)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(clickEvent) => {
                if (!remindersEnabled || pending) {
                  clickEvent.preventDefault();
                  return;
                }
                onMarkSent(event);
              }}
              className={cn(
                "flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-semibold text-ink-muted hover:bg-surface",
                (!remindersEnabled || pending) && "pointer-events-none opacity-50"
              )}
            >
              <WhatsAppIcon className="h-4 w-4" />
              {pending ? "Saving" : "WhatsApp"}
            </a>
          ) : (
            <button
              type="button"
              onClick={() => onMarkSent(event)}
              disabled={!remindersEnabled || pending}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-semibold text-ink-muted hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {pending ? "Saving" : "Mark sent"}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

function DetailGroup({ rows }: { rows: [string, string | undefined][] }) {
  return (
    <div className="space-y-3">
      {rows
        .filter(([, value]) => Boolean(value))
        .map(([label, value]) => (
          <div key={label} className="grid grid-cols-[92px_1fr] gap-3 text-sm">
            <div className="text-ink-faint">{label}</div>
            <div className="min-w-0 break-words font-medium text-ink">{value}</div>
          </div>
        ))}
    </div>
  );
}

function DayHeader({ day }: { day: string }) {
  const isToday = day === todayIso();
  return (
    <div
      className={cn(
        "border-b px-4 py-3",
        isToday ? "border-primary/30 bg-primary-tint" : "border-border-soft"
      )}
    >
      <div className={cn("text-xs font-semibold uppercase", isToday ? "text-primary" : "text-ink-faint")}>
        {formatWeekday(day)}
      </div>
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-ink">{formatShortDate(day)}</div>
        {isToday && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">
            Today
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyDay() {
  return (
    <div className="flex h-24 items-center justify-center text-center text-xs text-ink-faint">
      No events
    </div>
  );
}

function CriticalBadge({ event }: { event: CalendarEvent }) {
  const label = getCriticalLabel(event);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full px-2 py-1 text-[11px] font-semibold",
        event.isPastDue
          ? "bg-chip-red text-chip-red-fg"
          : event.tone === "amber"
            ? "bg-chip-peach text-chip-peach-fg"
            : "bg-surface text-ink-muted"
      )}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

function getCriticalLabel(event: CalendarEvent): string {
  if (isCancelledEvent(event)) return "Cancelled";
  if (event.type === "Payment") return event.isPastDue ? "Overdue" : "Payment due";
  if (event.type === "Production" && event.isPastDue) return "Delayed";
  if (event.type === "Trial" && event.isPastDue) return "Trial overdue";
  if ((event.type === "Delivery" || event.type === "Pickup") && event.isPastDue) {
    return "Overdue";
  }
  if (event.priority === "High") return "High priority";
  if (event.status) return event.status;
  return event.type;
}

function displayEventId(event: CalendarEvent): string {
  const identifier = event.jobCardNumber ?? event.orderNumber ?? event.title;
  const match = identifier.match(/^([A-Z]+)-\d{4}-(\d+)$/);
  if (match) return `${match[1]}-${match[2]}`;
  return identifier;
}

function getRecordHref(event: CalendarEvent): string {
  return event.jobCardId ? `/job-cards?view=${event.jobCardId}` : `/orders?view=${event.orderId}`;
}

function getOpenRecordLabel(event: CalendarEvent): string {
  if (event.type === "Production" && event.jobCardId) return "Open job card";
  if (event.type === "Payment") return "Open payment order";
  if (event.type === "Pickup") return "Open pickup order";
  if (event.type === "Trial") return "Open order details";
  return "Open delivery order";
}

function compactSubtitle(event: CalendarEvent): string {
  return [event.customerName, shortEventLabel(event)].filter(Boolean).join(" - ");
}

function shortEventLabel(event: CalendarEvent): string {
  if (event.type === "Production") {
    return event.subtitle;
  }
  const parts = event.subtitle.split(" - ");
  return parts.slice(2).join(" - ") || parts[0] || event.type;
}

function getTypeCounts(events: CalendarEvent[]): { type: CalendarEventType; count: number }[] {
  return EVENT_FILTERS.map(({ type }) => ({
    type,
    count: events.filter((event) => event.type === type).length,
  })).filter((item) => item.count > 0);
}

function pluralizeType(type: CalendarEventType, count: number): string {
  if (count === 1) return type;
  if (type === "Delivery") return "Deliveries";
  if (type === "Pickup") return "Pickups";
  if (type === "Trial") return "Trials";
  if (type === "Production") return "Production";
  return "Payments";
}

function isCancelledEvent(event: CalendarEvent): boolean {
  return event.status.toLowerCase() === "cancelled";
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

function formatLongDate(iso: string): string {
  return parseIso(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatWeekday(iso: string): string {
  return parseIso(iso).toLocaleDateString("en-IN", { weekday: "short" });
}
