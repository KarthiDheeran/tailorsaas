import type {
  CommunicationTemplate,
  CommunicationTemplateType,
} from "@/lib/types";

export const COMMUNICATION_TEMPLATE_TYPES: CommunicationTemplateType[] = [
  "Order Confirmation",
  "Delivery Reminder",
  "Trial Reminder",
  "Payment Reminder",
  "Ready for Pickup",
  "Feedback Request",
  "Promotional Message",
  "Production Reminder",
  "Delay Notice",
  "Rework Notice",
];

export const COMMUNICATION_TEMPLATE_PLACEHOLDERS = [
  "customer_name",
  "order_number",
  "job_card_number",
  "garment",
  "date",
  "balance",
  "assigned_staff",
  "assigned_staff_text",
  "reason",
];

export const DEFAULT_COMMUNICATION_TEMPLATES: CommunicationTemplate[] = [
  {
    templateType: "Order Confirmation",
    title: "Order Confirmation",
    body: "Hi {{customer_name}}, your order {{order_number}} has been confirmed. Delivery date: {{date}}.",
    active: true,
    whatsappEnabled: true,
    smsEnabled: false,
    emailEnabled: false,
    updatedAt: "",
  },
  {
    templateType: "Delivery Reminder",
    title: "Delivery Reminder",
    body: "Hi {{customer_name}}, your order {{order_number}} is scheduled for delivery on {{date}}.",
    active: true,
    whatsappEnabled: true,
    smsEnabled: false,
    emailEnabled: false,
    updatedAt: "",
  },
  {
    templateType: "Trial Reminder",
    title: "Trial Reminder",
    body: "Hi {{customer_name}}, this is a reminder for your trial on {{date}} for order {{order_number}}.",
    active: true,
    whatsappEnabled: true,
    smsEnabled: false,
    emailEnabled: false,
    updatedAt: "",
  },
  {
    templateType: "Payment Reminder",
    title: "Payment Reminder",
    body: "Hi {{customer_name}}, payment of Rs {{balance}} is pending for order {{order_number}}.",
    active: true,
    whatsappEnabled: true,
    smsEnabled: false,
    emailEnabled: false,
    updatedAt: "",
  },
  {
    templateType: "Ready for Pickup",
    title: "Ready for Pickup",
    body: "Hi {{customer_name}}, your order {{order_number}} is ready for pickup. Balance due: Rs {{balance}}.",
    active: true,
    whatsappEnabled: true,
    smsEnabled: false,
    emailEnabled: false,
    updatedAt: "",
  },
  {
    templateType: "Feedback Request",
    title: "Feedback Request",
    body: "Hi {{customer_name}}, thank you for choosing us. Please share your feedback for order {{order_number}}.",
    active: true,
    whatsappEnabled: true,
    smsEnabled: false,
    emailEnabled: false,
    updatedAt: "",
  },
  {
    templateType: "Promotional Message",
    title: "Promotional Message",
    body: "Hi {{customer_name}}, we have new tailoring offers and styles available. Reply here to book your next order.",
    active: true,
    whatsappEnabled: true,
    smsEnabled: false,
    emailEnabled: false,
    updatedAt: "",
  },
  {
    templateType: "Production Reminder",
    title: "Production Reminder",
    body: "{{job_card_number}} ({{garment}}) is due on {{date}}{{assigned_staff_text}}.",
    active: true,
    whatsappEnabled: true,
    smsEnabled: false,
    emailEnabled: false,
    updatedAt: "",
  },
  {
    templateType: "Delay Notice",
    title: "Delay Notice",
    body: "Hi {{customer_name}}, your order {{order_number}} is delayed. Reason: {{reason}}.",
    active: true,
    whatsappEnabled: true,
    smsEnabled: false,
    emailEnabled: false,
    updatedAt: "",
  },
  {
    templateType: "Rework Notice",
    title: "Rework / Alteration Notice",
    body: "Hi {{customer_name}}, your order {{order_number}} needs alteration/rework. Reason: {{reason}}.",
    active: true,
    whatsappEnabled: true,
    smsEnabled: false,
    emailEnabled: false,
    updatedAt: "",
  },
];

export function mergeCommunicationTemplateDefaults(
  templates: CommunicationTemplate[]
): CommunicationTemplate[] {
  const byType = new Map(templates.map((template) => [template.templateType, template]));
  return DEFAULT_COMMUNICATION_TEMPLATES.map((template) => ({
    ...template,
    ...byType.get(template.templateType),
  }));
}

export function renderCommunicationTemplate(
  template: Pick<CommunicationTemplate, "body" | "active"> | undefined,
  fallbackBody: string,
  values: Record<string, string | number | undefined | null>
): string {
  const body = template?.active === false ? fallbackBody : template?.body || fallbackBody;
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = values[key];
    return value === undefined || value === null ? "" : String(value);
  });
}
