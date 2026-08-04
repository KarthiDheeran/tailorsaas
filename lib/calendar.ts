import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCalendarReminders,
  isMissingCalendarRemindersSchemaError,
  type CalendarReminderTargetType,
  type CalendarReminderType,
} from "@/lib/data/calendar-reminders-db";
import { renderCommunicationTemplate } from "@/lib/communication-templates";
import { getCommunicationTemplatesWithFallback } from "@/lib/data/communication-templates-db";
import {
  getJobCardReportRows,
  isMissingJobCardsSchemaError,
} from "@/lib/data/job-cards-db";
import {
  getOrderListRowsInDateRange,
  getOrderListRowsInTrialDateRange,
} from "@/lib/data/orders-db";
import { getStaff } from "@/lib/data/staff-db";
import { formatCurrency } from "@/lib/currency";
import { isReceivableOrder } from "@/lib/order-finance";

export type CalendarEventType = "Delivery" | "Trial" | "Production" | "Payment" | "Pickup";
export type CalendarEventTone = "blue" | "green" | "amber" | "red" | "slate";

export interface CalendarEvent {
  id: string;
  eventKey: string;
  type: CalendarEventType;
  date: string;
  title: string;
  subtitle: string;
  customerName?: string;
  customerPhone?: string;
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
  whatsappEnabled: boolean;
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
  const [deliveryOrders, trialOrders, jobCards] = await Promise.all([
    getOrderListRowsInDateRange(supabase, "delivery_date", input.startDate, input.endDate),
    getOrderListRowsInTrialDateRange(supabase, input.startDate, input.endDate),
    getCalendarJobCards(supabase, input.todayIso, input.startDate, input.endDate),
  ]);
  const orders = Array.from(
    new Map([...deliveryOrders, ...trialOrders].map((order) => [order.id, order])).values()
  );
  const { templates } = await getCommunicationTemplatesWithFallback(supabase);
  const templateByType = new Map(templates.map((template) => [template.templateType, template]));

  const events: CalendarEvent[] = [];

  for (const order of orders) {
    const customerName = order.customerSnapshot?.name ?? "Unknown customer";
    const customerPhone = order.customerSnapshot?.phone;

    if (isInRange(order.deliveryDate, input.startDate, input.endDate)) {
      const active = order.status !== "Delivered" && order.status !== "Cancelled";
      const template = templateByType.get("Delivery Reminder");
      events.push({
        id: `delivery:${order.id}:${order.deliveryDate}`,
        eventKey: `delivery:${order.id}:${order.deliveryDate}`,
        type: "Delivery",
        date: order.deliveryDate,
        title: order.orderNumber,
        subtitle: `Delivery - ${customerName} - ${itemSummary(order.items.length)}`,
        customerName,
        customerPhone,
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        tone: active && order.deliveryDate < input.todayIso ? "red" : "green",
        reminderType: "Delivery",
        reminderTargetType: "Order",
        reminderTargetId: order.id,
        reminderMessage: renderCommunicationTemplate(
          template,
          `Hi ${customerName}, your order ${order.orderNumber} is scheduled for delivery on ${order.deliveryDate}.`,
          {
            customer_name: customerName,
            order_number: order.orderNumber,
            date: order.deliveryDate,
          }
        ),
        whatsappEnabled: isTemplateChannelEnabled(template, "whatsapp"),
        isPastDue: active && order.deliveryDate < input.todayIso,
      });
    }

    if (
      order.trialDate &&
      order.status !== "Delivered" &&
      order.status !== "Cancelled" &&
      isInRange(order.trialDate, input.startDate, input.endDate)
    ) {
      const template = templateByType.get("Trial Reminder");
      events.push({
        id: `trial:${order.id}:${order.trialDate}`,
        eventKey: `trial:${order.id}:${order.trialDate}`,
        type: "Trial",
        date: order.trialDate,
        title: order.orderNumber,
        subtitle: `Trial - ${customerName}`,
        customerName,
        customerPhone,
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.trialDate < input.todayIso ? "Trial overdue" : "Trial scheduled",
        tone: order.trialDate < input.todayIso ? "amber" : "blue",
        reminderType: "Trial",
        reminderTargetType: "Order",
        reminderTargetId: order.id,
        reminderMessage: renderCommunicationTemplate(
          template,
          `Hi ${customerName}, this is a reminder for your trial on ${order.trialDate} for order ${order.orderNumber}.`,
          {
            customer_name: customerName,
            order_number: order.orderNumber,
            date: order.trialDate,
          }
        ),
        whatsappEnabled: isTemplateChannelEnabled(template, "whatsapp"),
        isPastDue: order.trialDate < input.todayIso,
      });
    }

    if (
      input.includePayments &&
      isReceivableOrder(order) &&
      isInRange(order.deliveryDate, input.startDate, input.endDate)
    ) {
      const template = templateByType.get("Payment Reminder");
      const formattedBalance = formatCurrency(order.balance);
      events.push({
        id: `payment:${order.id}:${order.deliveryDate}`,
        eventKey: `payment:${order.id}:${order.deliveryDate}`,
        type: "Payment",
        date: order.deliveryDate,
        title: order.orderNumber,
        subtitle: `Payment - ${customerName} - ${formattedBalance}`,
        customerName,
        customerPhone,
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.paymentStatus ?? "Due",
        tone: order.deliveryDate < input.todayIso ? "red" : "amber",
        reminderType: "Payment",
        reminderTargetType: "Order",
        reminderTargetId: order.id,
        reminderMessage: renderCommunicationTemplate(
          template,
          `Hi ${customerName}, payment of ${formattedBalance} is pending for order ${order.orderNumber}.`,
          {
            customer_name: customerName,
            order_number: order.orderNumber,
            date: order.deliveryDate,
            balance: formattedBalance,
          }
        ),
        whatsappEnabled: isTemplateChannelEnabled(template, "whatsapp"),
        isPastDue: order.deliveryDate < input.todayIso,
      });
    }

    if (order.status === "Ready" && isInRange(order.deliveryDate, input.startDate, input.endDate)) {
      const template = templateByType.get("Ready for Pickup");
      const formattedBalance = formatCurrency(order.balance);
      events.push({
        id: `pickup:${order.id}:${order.deliveryDate}`,
        eventKey: `pickup:${order.id}:${order.deliveryDate}`,
        type: "Pickup",
        date: order.deliveryDate,
        title: order.orderNumber,
        subtitle: `Pickup - ${customerName} - ${itemSummary(order.items.length)}`,
        customerName,
        customerPhone,
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        tone: order.deliveryDate < input.todayIso ? "red" : "green",
        reminderType: "Pickup",
        reminderTargetType: "Order",
        reminderTargetId: order.id,
        reminderMessage: renderCommunicationTemplate(
          template,
          `Hi ${customerName}, your order ${order.orderNumber} is ready for pickup. Balance due: ${formattedBalance}.`,
          {
            customer_name: customerName,
            order_number: order.orderNumber,
            date: order.deliveryDate,
            balance: formattedBalance,
          }
        ),
        whatsappEnabled: isTemplateChannelEnabled(template, "whatsapp"),
        isPastDue: order.deliveryDate < input.todayIso,
      });
    }
  }

  for (const card of jobCards) {
    if (!isInRange(card.deliveryDate, input.startDate, input.endDate)) continue;
    if (card.productionBucket === "Closed") continue;
    const template = templateByType.get("Production Reminder");
    events.push({
      id: `production:${card.id}:${card.deliveryDate}`,
      eventKey: `production:${card.id}:${card.deliveryDate}`,
      type: "Production",
      date: card.deliveryDate,
      title: card.jobCardNumber,
      subtitle: `${card.taskType ?? card.stage} - ${card.garment}`,
      customerName: card.customer?.name,
      customerPhone: card.customer?.phone,
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
      reminderMessage: renderCommunicationTemplate(
        template,
        `${card.jobCardNumber} (${card.garment}) is due on ${card.deliveryDate}${card.assignedTo ? ` for ${card.assignedTo}` : ""}.`,
        {
          customer_name: card.customer?.name,
          order_number: card.orderNumber,
          job_card_number: card.jobCardNumber,
          garment: card.garment,
          date: card.deliveryDate,
          assigned_staff: card.assignedTo,
          assigned_staff_text: card.assignedTo ? ` for ${card.assignedTo}` : "",
        }
      ),
      whatsappEnabled: isTemplateChannelEnabled(template, "whatsapp"),
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

function isTemplateChannelEnabled(
  template: { active: boolean; whatsappEnabled: boolean } | undefined,
  channel: "whatsapp"
): boolean {
  if (!template) return true;
  if (template.active === false) return false;
  if (channel === "whatsapp") return template.whatsappEnabled !== false;
  return true;
}

async function getCalendarJobCards(
  supabase: SupabaseClient,
  todayIso: string,
  startDate: string,
  endDate: string
) {
  try {
    const staffList = await getStaff(supabase).catch(() => []);
    return await getJobCardReportRows(supabase, todayIso, staffList, {
      dueFrom: startDate,
      dueTo: endDate,
    });
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
    Pickup: 4,
    Payment: 5,
  };
  return order[a.type] - order[b.type];
}
