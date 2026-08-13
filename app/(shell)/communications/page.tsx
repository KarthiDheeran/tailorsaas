"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CalendarDays, ChevronDown, Search, Send, Settings } from "lucide-react";
import {
  getCommunicationTargetsAction,
  getReminderInboxAction,
  logWhatsAppMessageAction,
  getWhatsAppMessagesAction,
} from "@/app/(shell)/communications/actions";
import { markReminderSentAction } from "@/app/(shell)/calendar/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import type { CalendarData, CalendarEvent } from "@/lib/calendar";
import type { CustomerContactRow } from "@/lib/data/customers-db";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import type {
  CommunicationTemplateType,
  Order,
  WhatsAppMessage,
  WhatsAppMessageContextType,
  WhatsAppMessageStatus,
} from "@/lib/types";
import { DEFAULT_COMMUNICATION_TEMPLATES, renderCommunicationTemplate } from "@/lib/communication-templates";

const QUICK_TEMPLATE_TYPES: CommunicationTemplateType[] = [
  "Order Confirmation",
  "Ready for Pickup",
  "Feedback Request",
  "Promotional Message",
];

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
  return event.orderId ? `/orders?view=${event.orderId}` : "/orders";
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
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-ink-muted hover:bg-surface-muted"
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
                ) : event.customerPhone && event.whatsappEnabled ? (
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
                    <WhatsAppIcon className="h-3.5 w-3.5" />
                    {pendingEventKey === event.eventKey ? "Saving..." : "WhatsApp"}
                  </a>
                ) : event.customerPhone && !event.whatsappEnabled ? (
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-3 text-xs font-semibold text-ink-faint">
                    <WhatsAppIcon className="h-3.5 w-3.5" />
                    WhatsApp off
                  </span>
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
  const [customers, setCustomers] = useState<CustomerContactRow[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
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
    getCommunicationTargetsAction().then((result) => {
      if (cancelled) return;
      setCustomers(result.customers);
      setOrders(result.orders);
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

      <QuickWhatsAppComposer
        customers={customers}
        orders={orders}
        onSent={() => {
          getWhatsAppMessagesAction().then((result) => setMessages(result));
        }}
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
              <SelectShell className="lg:w-44">
                <select
                  value={contextFilter}
                  onChange={(event) =>
                    setContextFilter(event.target.value as "all" | WhatsAppMessageContextType)
                  }
                  className={selectClassName("text-ink-muted font-medium")}
                >
                  {CONTEXT_FILTERS.map((context) => (
                    <option key={context} value={context}>
                      {context === "all" ? "All contexts" : context}
                    </option>
                  ))}
                </select>
              </SelectShell>
              <SelectShell className="lg:w-40">
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as "all" | WhatsAppMessageStatus)
                  }
                  className={selectClassName("text-ink-muted font-medium")}
                >
                  {STATUS_FILTERS.map((status) => (
                    <option key={status} value={status}>
                      {status === "all" ? "All statuses" : status}
                    </option>
                  ))}
                </select>
              </SelectShell>
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
                      <tr key={message.id} className="align-top hover:bg-surface-muted">
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
                              <WhatsAppIcon className="h-3.5 w-3.5" />
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

function QuickWhatsAppComposer({
  customers,
  orders,
  onSent,
}: {
  customers: CustomerContactRow[];
  orders: Order[];
  onSent: () => void;
}) {
  const [templateType, setTemplateType] =
    useState<CommunicationTemplateType>("Order Confirmation");
  const [customerId, setCustomerId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [manualMessage, setManualMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const customerOrders = selectedCustomer
    ? orders.filter((order) => order.customerId === selectedCustomer.id)
    : [];
  const selectedOrder = orders.find((order) => order.id === orderId);
  const template = DEFAULT_COMMUNICATION_TEMPLATES.find(
    (candidate) => candidate.templateType === templateType
  );
  const renderedMessage = selectedCustomer
    ? renderCommunicationTemplate(template, template?.body ?? "", {
        customer_name: selectedCustomer.name,
        order_number: selectedOrder?.orderNumber,
        date: selectedOrder?.deliveryDate,
        balance: selectedOrder?.balance ?? 0,
      })
    : "";
  const message = manualMessage.trim() || renderedMessage;
  const needsOrder = templateType !== "Promotional Message";

  async function handleOpenWhatsApp() {
    setError(null);
    if (!selectedCustomer) {
      setError("Select a customer.");
      return;
    }
    if (needsOrder && !selectedOrder) {
      setError("Select an order.");
      return;
    }
    if (!message.trim()) {
      setError("Message is required.");
      return;
    }
    const result = await logWhatsAppMessageAction({
      phone: selectedCustomer.phone,
      message,
      contextType: selectedOrder ? "Order" : "Customer",
      contextId: selectedOrder?.id ?? selectedCustomer.id,
      status: "Opened",
    });
    if (!result.success) {
      setError(result.error);
      return;
    }
    window.open(buildWhatsAppUrl(selectedCustomer.phone, message), "_blank", "noopener,noreferrer");
    onSent();
  }

  return (
    <section className="mb-6 rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Quick WhatsApp</h2>
          <p className="text-sm text-ink-muted">
            Send confirmations, pickup messages, feedback requests, or simple promotions.
          </p>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[0.8fr_1fr_1fr]">
        <SelectShell>
          <select
            value={templateType}
            onChange={(event) => {
              setTemplateType(event.target.value as CommunicationTemplateType);
              setManualMessage("");
            }}
            className={selectClassName("text-ink")}
          >
            {QUICK_TEMPLATE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </SelectShell>
        <SelectShell>
          <select
            value={customerId}
            onChange={(event) => {
              setCustomerId(event.target.value);
              setOrderId("");
              setManualMessage("");
            }}
            className={selectClassName("text-ink")}
          >
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} - {customer.phone}
              </option>
            ))}
          </select>
        </SelectShell>
        <SelectShell disabled={!needsOrder || customerOrders.length === 0}>
          <select
            value={orderId}
            onChange={(event) => {
              setOrderId(event.target.value);
              setManualMessage("");
            }}
            disabled={!needsOrder || customerOrders.length === 0}
            className={selectClassName("text-ink disabled:bg-surface-muted disabled:text-ink-faint")}
          >
            <option value="">{needsOrder ? "Select order" : "No order needed"}</option>
            {customerOrders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.orderNumber} - {order.status}
              </option>
            ))}
          </select>
        </SelectShell>
      </div>
      <textarea
        value={manualMessage || renderedMessage}
        onChange={(event) => setManualMessage(event.target.value)}
        rows={3}
        className="mt-3 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
      />
      {error && <p className="mt-2 text-sm font-medium text-chip-red-fg">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleOpenWhatsApp}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          <WhatsAppIcon className="h-3.5 w-3.5" />
          Open WhatsApp
        </button>
      </div>
    </section>
  );
}

function SelectShell({
  children,
  className,
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      {children}
      <ChevronDown
        className={cn(
          "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2",
          disabled ? "text-ink-faint" : "text-ink-muted"
        )}
      />
    </div>
  );
}

function selectClassName(extra?: string): string {
  return cn(
    "h-10 w-full appearance-none rounded-lg border border-border bg-white py-0 pl-3 pr-10 text-sm leading-10 outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint",
    extra
  );
}

export default function CommunicationsPage() {
  return (
    <RequirePermission permission="communications.view">
      <CommunicationsContent />
    </RequirePermission>
  );
}
