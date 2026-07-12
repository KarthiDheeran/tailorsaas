"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CalendarDays, MessageCircle, Search, Send, Settings } from "lucide-react";
import {
  getReminderInboxAction,
  getWhatsAppMessagesAction,
} from "@/app/(shell)/communications/actions";
import { markReminderSentAction } from "@/app/(shell)/calendar/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";
import type { CalendarData, CalendarEvent } from "@/lib/calendar";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import type {
  WhatsAppMessage,
  WhatsAppMessageContextType,
  WhatsAppMessageStatus,
} from "@/lib/types";

const CONTEXT_FILTERS: ("all" | WhatsAppMessageContextType)[] = [
  "all",
  "Order",
  "Job Card",
  "Customer",
  "Delivery",
  "Payment",
  "Calendar",
];

const STATUS_FILTERS: ("all" | WhatsAppMessageStatus)[] = [
  "all",
  "Opened",
  "Marked Sent",
];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function contextHref(message: WhatsAppMessage): string | null {
  if (!message.contextId) return null;
  if (message.contextType === "Order" || message.contextType === "Calendar") {
    return `/orders?view=${message.contextId}`;
  }
  if (message.contextType === "Job Card") return `/job-cards?view=${message.contextId}`;
  if (message.contextType === "Customer") return `/customers/${message.contextId}`;
  return null;
}

function reminderHref(event: CalendarEvent): string {
  if (event.jobCardId) return `/job-cards?view=${event.jobCardId}`;
  return event.orderId ? `/orders?view=${event.orderId}` : "/calendar";
}

function ReminderInbox({
  data,
  pendingEventKey,
  onMarkSent,
}: {
  data: CalendarData | null;
  pendingEventKey: string | null;
  onMarkSent: (event: CalendarEvent) => void;
}) {
  if (!data) return null;
  const visibleEvents = data.events
    .filter((event) => event.isPastDue || !event.reminderSentAt)
    .slice(0, 12);

  return (
    <section className="mb-6 rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink">Reminder Inbox</h2>
            <p className="text-sm text-ink-muted">
              Overdue and unsent trial, delivery, production, and payment reminders.
            </p>
          </div>
        </div>
        <Link
          href="/settings/communication-templates"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-ink-muted hover:bg-surface"
        >
          <Settings className="h-3.5 w-3.5" />
          Templates
        </Link>
      </div>

      {!data.remindersEnabled && (
        <div className="mb-4 rounded-lg border border-chip-peach bg-chip-peach px-3 py-2 text-xs font-semibold text-chip-peach-fg">
          Reminder tracking migration is pending, so sent status cannot be saved yet.
        </div>
      )}

      {visibleEvents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-soft px-4 py-8 text-center text-sm text-ink-muted">
          No pending reminders right now.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visibleEvents.map((event) => (
            <article key={event.eventKey} className="border border-border-soft p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{event.title}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        event.isPastDue
                          ? "bg-chip-red text-chip-red-fg"
                          : "bg-chip-info text-chip-info-fg"
                      )}
                    >
                      {event.isPastDue ? "Needs attention" : event.type}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-ink-muted">
                    {event.subtitle}
                  </p>
                </div>
                <div className="whitespace-nowrap text-right text-xs text-ink-muted">
                  <CalendarDays className="mb-1 ml-auto h-3.5 w-3.5" />
                  {event.date}
                </div>
              </div>
              <p className="mb-3 line-clamp-2 text-xs text-ink-muted">
                {event.reminderMessage}
              </p>
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={reminderHref(event)}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Open
                </Link>
                {event.reminderSentAt ? (
                  <span className="text-xs font-semibold text-chip-mint-fg">Sent</span>
                ) : event.customerPhone ? (
                  <a
                    href={buildWhatsAppUrl(event.customerPhone, event.reminderMessage)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(clickEvent) => {
                      if (!data.remindersEnabled || pendingEventKey === event.eventKey) {
                        clickEvent.preventDefault();
                        return;
                      }
                      onMarkSent(event);
                    }}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-primary hover:bg-primary-tint",
                      (!data.remindersEnabled || pendingEventKey === event.eventKey) &&
                        "pointer-events-none opacity-50"
                    )}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    {pendingEventKey === event.eventKey ? "Saving..." : "WhatsApp"}
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={!data.remindersEnabled || pendingEventKey === event.eventKey}
                    onClick={() => onMarkSent(event)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-primary hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {pendingEventKey === event.eventKey ? "Saving..." : "Mark sent"}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CommunicationsContent() {
  const [messages, setMessages] = useState<WhatsAppMessage[] | null>([]);
  const [reminderData, setReminderData] = useState<CalendarData | null>(null);
  const [query, setQuery] = useState("");
  const [contextFilter, setContextFilter] = useState<"all" | WhatsAppMessageContextType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | WhatsAppMessageStatus>("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [pendingEventKey, setPendingEventKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reminderRefreshKey, setReminderRefreshKey] = useState(0);
  const todayIso = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let cancelled = false;
    getWhatsAppMessagesAction()
      .then((result) => {
        if (cancelled) return;
        setMessages(result);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Failed to load communications."));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getReminderInboxAction(todayIso)
      .then((result) => {
        if (cancelled) return;
        setReminderData(result);
        setReminderError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setReminderError(getErrorMessage(error, "Failed to load reminders."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reminderRefreshKey, todayIso]);

  async function markSent(event: CalendarEvent) {
    setPendingEventKey(event.eventKey);
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
    setReminderRefreshKey((key) => key + 1);
  }

  const filteredMessages = useMemo(() => {
    const rows = messages ?? [];
    const needle = query.trim().toLowerCase();
    return rows.filter((message) => {
      if (contextFilter !== "all" && message.contextType !== contextFilter) return false;
      if (statusFilter !== "all" && message.status !== statusFilter) return false;
      if (!needle) return true;
      return [
        message.phone,
        message.message,
        message.contextType,
        message.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [contextFilter, messages, query, statusFilter]);

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Communications</h1>
          <p className="text-sm text-ink-muted">
            Reminder inbox, WhatsApp actions, and customer-message log.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="mb-5">
          <LoadError message={loadError} />
        </div>
      )}

      {reminderError && (
        <div className="mb-5">
          <LoadError message={reminderError} onRetry={() => setReminderRefreshKey((key) => key + 1)} />
        </div>
      )}

      <ReminderInbox
        data={reminderData}
        pendingEventKey={pendingEventKey}
        onMarkSent={markSent}
      />

      {isLoading ? (
        <LoadingState label="Loading communications..." />
      ) : messages === null ? (
        <div className="rounded-xl border border-border-soft bg-white p-4 text-sm text-ink-muted shadow-soft">
          WhatsApp message logging is ready in the app, but the database migration has not been applied yet.
          Apply <span className="font-semibold text-ink">supabase/migrations/0015_whatsapp_messages.sql</span> to start saving the log.
        </div>
      ) : (
        <>
          <div className="mb-5 rounded-xl border border-border-soft bg-white p-4 shadow-soft">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search phone, message, context, or status"
                className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              />
            </div>
              <select
                value={contextFilter}
                onChange={(event) =>
                  setContextFilter(event.target.value as "all" | WhatsAppMessageContextType)
                }
                className="h-10 rounded-lg border border-border bg-white px-3 text-sm font-medium text-ink-muted outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              >
                {CONTEXT_FILTERS.map((context) => (
                  <option key={context} value={context}>
                    {context === "all" ? "All contexts" : context}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as "all" | WhatsAppMessageStatus)
                }
                className="h-10 rounded-lg border border-border bg-white px-3 text-sm font-medium text-ink-muted outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              >
                {STATUS_FILTERS.map((status) => (
                  <option key={status} value={status}>
                    {status === "all" ? "All statuses" : status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="text-[13px] font-semibold text-ink-muted">
                <tr className="border-b border-border-soft">
                  <th className="px-5 py-3">Time</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Context</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Message</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {filteredMessages.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-ink-muted">
                      No WhatsApp messages match this view.
                    </td>
                  </tr>
                ) : (
                  filteredMessages.map((message) => {
                    const href = contextHref(message);
                    return (
                      <tr key={message.id} className="align-top hover:bg-surface">
                        <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                          {formatDateTime(message.sentAt)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 font-medium text-ink">
                          {message.phone}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                          {message.contextType}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3">
                          <span className="rounded-full bg-chip-mint px-2.5 py-1 text-xs font-semibold text-chip-mint-fg">
                            {message.status}
                          </span>
                        </td>
                        <td className="max-w-xl px-5 py-3 text-ink-muted">
                          <div className="line-clamp-2">{message.message}</div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-right">
                          {href ? (
                            <Link
                              href={href}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-primary hover:bg-primary-tint"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              Open
                            </Link>
                          ) : (
                            <span className="text-xs text-ink-faint">No link</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function CommunicationsPage() {
  return (
    <RequirePermission anyOf={["calendar.view", "orders.view", "customers.view"]}>
      <CommunicationsContent />
    </RequirePermission>
  );
}
