import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCalendarReminders,
  isMissingCalendarRemindersSchemaError,
  type CalendarReminderTargetType,
  type CalendarReminderType,
} from "@/lib/data/calendar-reminders-db";
import {
  getJobCards,
  isMissingJobCardsSchemaError,
} from "@/lib/data/job-cards-db";
import { getAllOrders } from "@/lib/data/orders-db";
import { getStaff } from "@/lib/data/staff-db";

export type CalendarEventType = "Delivery" | "Trial" | "Production" | "Payment";
export type CalendarEventTone = "blue" | "green" | "amber" | "red" | "slate";

export interface CalendarEvent {
  id: string;
  eventKey: string;
  type: CalendarEventType;
  date: string;
  title: string;
  subtitle: string;
  customerName?: string;
  orderId?: string;
  orderNumber?: string;
  jobCardId?: string;
  jobCardNumber?: string;
  assignedTo?: string;
  status: string;
  priority?: string;
  tone: CalendarEventTone;
  reminderType: CalendarReminderType;
  reminderTargetType: CalendarReminderTargetType;
  reminderTargetId?: string;
  reminderMessage: string;
  reminderSentAt?: string;
  isPastDue: boolean;
}

export interface CalendarData {
  events: CalendarEvent[];
  remindersEnabled: boolean;
}

export async function getCalendarData(
  supabase: SupabaseClient,
  input: {
    startDate: string;
    endDate: string;
    todayIso: string;
    includePayments: boolean;
  }
): Promise<CalendarData> {
  const [orders, jobCards] = await Promise.all([
    getAllOrders(supabase),
    getCalendarJobCards(supabase, input.todayIso),
  ]);

  const events: CalendarEvent[] = [];

  for (const order of orders) {
    const customerName = order.customerSnapshot?.name ?? "Unknown customer";
    const customerPhone = order.customerSnapshot?.phone;

    if (isInRange(order.deliveryDate, input.startDate, input.endDate)) {
      const active = order.status !== "Delivered" && order.status !== "Cancelled";
      events.push({
        id: `delivery:${order.id}:${order.deliveryDate}`,
        eventKey: `delivery:${order.id}:${order.deliveryDate}`,
        type: "Delivery",
        date: order.deliveryDate,
        title: order.orderNumber,
        subtitle: `Delivery - ${customerName} - ${itemSummary(order.items.length)}`,
        customerName,
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        tone: active && order.deliveryDate < input.todayIso ? "red" : "green",
        reminderType: "Delivery",
        reminderTargetType: "Order",
        reminderTargetId: order.id,
        reminderMessage: `Hi ${customerName}, your order ${order.orderNumber} is scheduled for delivery on ${order.deliveryDate}.${customerPhone ? "" : ""}`,
        isPastDue: active && order.deliveryDate < input.todayIso,
      });
    }

    if (order.trialDate && isInRange(order.trialDate, input.startDate, input.endDate)) {
      events.push({
        id: `trial:${order.id}:${order.trialDate}`,
        eventKey: `trial:${order.id}:${order.trialDate}`,
        type: "Trial",
        date: order.trialDate,
        title: order.orderNumber,
        subtitle: `Trial - ${customerName}`,
        customerName,
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        tone: order.trialDate < input.todayIso && order.status !== "Delivered" ? "amber" : "blue",
        reminderType: "Trial",
        reminderTargetType: "Order",
        reminderTargetId: order.id,
        reminderMessage: `Hi ${customerName}, this is a reminder for your trial on ${order.trialDate} for order ${order.orderNumber}.`,
        isPastDue: order.trialDate < input.todayIso && order.status !== "Delivered",
      });
    }

    if (
      input.includePayments &&
      order.balance > 0 &&
      isInRange(order.deliveryDate, input.startDate, input.endDate)
    ) {
      events.push({
        id: `payment:${order.id}:${order.deliveryDate}`,
        eventKey: `payment:${order.id}:${order.deliveryDate}`,
        type: "Payment",
        date: order.deliveryDate,
        title: order.orderNumber,
        subtitle: `Payment - ${customerName} - Rs ${Number(order.balance).toLocaleString("en-IN")}`,
        customerName,
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.paymentStatus ?? "Due",
        tone: order.deliveryDate < input.todayIso ? "red" : "amber",
        reminderType: "Payment",
        reminderTargetType: "Order",
        reminderTargetId: order.id,
        reminderMessage: `Hi ${customerName}, payment of Rs ${Number(order.balance).toLocaleString("en-IN")} is pending for order ${order.orderNumber}.`,
        isPastDue: order.deliveryDate < input.todayIso,
      });
    }
  }

  for (const card of jobCards) {
    if (!isInRange(card.deliveryDate, input.startDate, input.endDate)) continue;
    if (card.productionBucket === "Closed") continue;
    events.push({
      id: `production:${card.id}:${card.deliveryDate}`,
      eventKey: `production:${card.id}:${card.deliveryDate}`,
      type: "Production",
      date: card.deliveryDate,
      title: card.jobCardNumber,
      subtitle: `${card.taskType ?? card.stage} - ${card.garment}`,
      customerName: card.customer?.name,
      orderId: card.orderId,
      orderNumber: card.orderNumber,
      jobCardId: card.id,
      jobCardNumber: card.jobCardNumber,
      assignedTo: card.assignedTo,
      status: card.taskStatus ?? card.stage,
      priority: card.priority,
      tone: card.isDelayed ? "red" : card.priority === "High" ? "amber" : "slate",
      reminderType: "Production",
      reminderTargetType: "Job Card",
      reminderTargetId: card.id,
      reminderMessage: `${card.jobCardNumber} (${card.garment}) is due on ${card.deliveryDate}${card.assignedTo ? ` for ${card.assignedTo}` : ""}.`,
      isPastDue: card.isDelayed,
    });
  }

  const withReminders = await applyReminderStatus(
    supabase,
    events,
    input.startDate,
    input.endDate
  );

  return {
    events: withReminders.events.sort(sortEvents),
    remindersEnabled: withReminders.remindersEnabled,
  };
}

async function getCalendarJobCards(
  supabase: SupabaseClient,
  todayIso: string
) {
  try {
    const staffList = await getStaff(supabase).catch(() => []);
    return await getJobCards(supabase, todayIso, staffList);
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) return [];
    throw error;
  }
}

async function applyReminderStatus(
  supabase: SupabaseClient,
  events: CalendarEvent[],
  startDate: string,
  endDate: string
): Promise<{ events: CalendarEvent[]; remindersEnabled: boolean }> {
  try {
    const reminders = await getCalendarReminders(supabase, startDate, endDate);
    const byKey = new Map(reminders.map((reminder) => [reminder.eventKey, reminder]));
    return {
      remindersEnabled: true,
      events: events.map((event) => ({
        ...event,
        reminderSentAt: byKey.get(event.eventKey)?.sentAt,
      })),
    };
  } catch (error) {
    if (isMissingCalendarRemindersSchemaError(error)) {
      return { events, remindersEnabled: false };
    }
    throw error;
  }
}

function isInRange(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate;
}

function itemSummary(count: number): string {
  return count === 1 ? "1 item" : `${count} items`;
}

function sortEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const order: Record<CalendarEventType, number> = {
    Trial: 1,
    Production: 2,
    Delivery: 3,
    Payment: 4,
  };
  return order[a.type] - order[b.type];
}
