"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { requireServerPermission } from "@/lib/auth/require-server-permission";
import {
  createMeasurementAttachment,
  deleteMeasurementAttachment,
  getMeasurementAttachmentById,
  getMeasurementAttachmentsForCustomer,
  MEASUREMENT_ATTACHMENTS_BUCKET,
} from "@/lib/data/measurement-attachments-db";
import {
  createCustomer,
  getCustomerById,
  getCustomerByPhone,
  getMeasurementHistoryForCustomer,
  getCustomerMeasurements,
  getCustomers,
  getGarmentMeasurement,
  getGarmentMeasurementDraftSeed,
  getGarmentMeasurementsForCustomer,
  saveCustomerMeasurements,
  saveGarmentMeasurement,
  searchCustomers,
  searchCustomersByPhone,
  updateCustomer,
} from "@/lib/data/customers-db";
import {
  getCustomerAreas,
  getCustomerDetail,
  getCustomerListRows,
  type CustomerDetail,
  type CustomerListRow,
} from "@/lib/customers-db";
import {
  getCustomerStatement,
  type CustomerStatement,
} from "@/lib/customer-statement";
import type {
  Customer,
  CustomerMeasurements,
  Gender,
  GarmentMeasurement,
  MeasurementAttachment,
  MeasurementAttachmentType,
  MeasurementHistoryEntry,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Phase 6A: Customers, Customer Measurements, and Garment Measurements are
// now real, Supabase-backed tables (supabase/migrations/0004_customers.sql) —
// reads AND writes both go through lib/data/customers-db.ts/
// lib/customers-db.ts (Phase 5A's read-relocation pattern continues to pay
// off here: since every page already calls these Server Actions rather than
// importing mock functions directly, swapping what's inside each action
// needed zero page/component changes).
//
// lib/data/stub-data.ts and lib/customers.ts are deliberately left
// UNTOUCHED — lib/reports.ts/customers-report-view.tsx still import the
// latter directly (Reports migration is Phase 6E), and stub-data.ts's own
// createOrder() still calls the old synchronous getCustomerById() to build
// customerSnapshot (Orders migration is Phase 6C). lib/customers-db.ts is a
// parallel fork of the 3 derived selectors, not a replacement, until those
// phases land.
//
// Known, accepted, temporary limitation: getOrdersForCustomer (still
// imported from the old stub-data.ts inside lib/customers-db.ts) returns
// orders keyed by mock customerId — a newly-created real customer's order
// history will correctly show empty until Orders migrates in 6C. Reports/
// Dashboard are unaffected by this change (they never imported anything
// from this actions file).
// ---------------------------------------------------------------------------

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const MEASUREMENT_ATTACHMENT_TYPES: MeasurementAttachmentType[] = [
  "Fit Photo",
  "Sketch",
  "Reference",
  "Alteration Mark",
  "Other",
];

const ALLOWED_MEASUREMENT_ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const MAX_MEASUREMENT_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function sanitizeStorageSegment(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function withSignedUrls(
  attachments: MeasurementAttachment[]
): Promise<MeasurementAttachment[]> {
  if (attachments.length === 0) return attachments;
  const admin = createAdminClient();
  const signed = await Promise.all(
    attachments.map(async (attachment) => {
      const { data } = await admin.storage
        .from(MEASUREMENT_ATTACHMENTS_BUCKET)
        .createSignedUrl(attachment.storagePath, 60 * 60);
      return { ...attachment, signedUrl: data?.signedUrl };
    })
  );
  return signed;
}

export async function getCustomersAction(): Promise<Customer[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.view");
  if (!guard.ok) return [];
  return getCustomers(supabase);
}

export async function getCustomerByIdAction(id: string): Promise<Customer | undefined> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.view");
  if (!guard.ok) return undefined;
  return getCustomerById(supabase, id);
}

export async function searchCustomersByPhoneAction(query: string): Promise<Customer[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.view");
  if (!guard.ok) return [];
  return searchCustomersByPhone(supabase, query);
}

// Matches by name or phone — used by the Orders page's main search box
// (order-list-filters.tsx), distinct from searchCustomersByPhoneAction's
// phone-only match used by the New Order flow's Phone field.
export async function searchCustomersAction(query: string): Promise<Customer[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.view");
  if (!guard.ok) return [];
  return searchCustomers(supabase, query);
}

export async function getCustomerByPhoneAction(phone: string): Promise<Customer | undefined> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.view");
  if (!guard.ok) return undefined;
  return getCustomerByPhone(supabase, phone);
}

export async function getCustomerListRowsAction(todayIso: string): Promise<CustomerListRow[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.view");
  if (!guard.ok) return [];
  return getCustomerListRows(createAdminClient(), todayIso);
}

export async function getCustomerAreasAction(): Promise<string[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.view");
  if (!guard.ok) return [];
  return getCustomerAreas(supabase);
}

export async function getCustomerDetailAction(
  customerId: string
): Promise<CustomerDetail | undefined> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.view");
  if (!guard.ok) return undefined;
  const customer = await getCustomerById(supabase, customerId);
  if (!customer) return undefined;
  return getCustomerDetail(supabase, customer);
}

export async function getCustomerStatementAction(
  customerId: string
): Promise<CustomerStatement | undefined> {
  const supabase = createServerClient();
  const customerGuard = await requireServerPermission(supabase, "customers.view");
  if (!customerGuard.ok) return undefined;
  const paymentGuard = await requireServerPermission(supabase, "orders.viewPayments");
  if (!paymentGuard.ok) return undefined;
  const customer = await getCustomerById(supabase, customerId);
  if (!customer) return undefined;
  return getCustomerStatement(supabase, customer);
}

export interface CustomerFormData {
  name: string;
  phone: string;
  address: string;
  area: string;
  gender?: Gender;
  notes?: string;
}

export async function createCustomerAction(
  data: CustomerFormData
): Promise<ActionResult<Customer>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.create");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!data.name.trim()) return { success: false, error: "Name is required." };
  if (!data.phone.trim()) return { success: false, error: "Phone is required." };
  const customer = await createCustomer(supabase, data);
  return { success: true, data: customer };
}

export async function updateCustomerAction(
  id: string,
  data: CustomerFormData
): Promise<ActionResult<Customer>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.edit");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!data.name.trim()) return { success: false, error: "Name is required." };
  if (!data.phone.trim()) return { success: false, error: "Phone is required." };
  const customer = await updateCustomer(supabase, id, data);
  if (!customer) return { success: false, error: "Customer not found." };
  return { success: true, data: customer };
}

export async function getCustomerMeasurementsAction(
  customerId: string
): Promise<CustomerMeasurements | undefined> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.viewMeasurements");
  if (!guard.ok) return undefined;
  return getCustomerMeasurements(supabase, customerId);
}

export async function saveCustomerMeasurementsAction(data: {
  customerId: string;
  values: Record<string, string>;
  notes?: string;
  source?: string;
}): Promise<ActionResult<CustomerMeasurements>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.editMeasurements");
  if (!guard.ok) return { success: false, error: guard.error };
  const record = await saveCustomerMeasurements(supabase, data);
  return { success: true, data: record };
}

export async function getGarmentMeasurementAction(
  customerId: string,
  garmentType: string
): Promise<GarmentMeasurement | undefined> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.viewMeasurements");
  if (!guard.ok) return undefined;
  return getGarmentMeasurement(supabase, customerId, garmentType);
}

export async function getGarmentMeasurementsForCustomerAction(
  customerId: string
): Promise<GarmentMeasurement[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.viewMeasurements");
  if (!guard.ok) return [];
  return getGarmentMeasurementsForCustomer(supabase, customerId);
}

export async function getGarmentMeasurementDraftSeedAction(
  customerId: string,
  garmentType: string
): Promise<{ values: Record<string, string>; fitNotes: string; notes: string }> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.viewMeasurements");
  if (!guard.ok) return { values: {}, fitNotes: "", notes: "" };
  return getGarmentMeasurementDraftSeed(supabase, customerId, garmentType);
}

export async function saveGarmentMeasurementAction(data: {
  customerId: string;
  garmentType: string;
  values: Record<string, string>;
  fitNotes?: string;
  notes?: string;
  source?: string;
}): Promise<ActionResult<GarmentMeasurement>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.editMeasurements");
  if (!guard.ok) return { success: false, error: guard.error };
  const record = await saveGarmentMeasurement(supabase, data);
  return { success: true, data: record };
}

export async function getMeasurementHistoryForCustomerAction(
  customerId: string
): Promise<MeasurementHistoryEntry[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.viewMeasurements");
  if (!guard.ok) return [];
  return getMeasurementHistoryForCustomer(supabase, customerId);
}

export async function getMeasurementAttachmentsForCustomerAction(
  customerId: string
): Promise<MeasurementAttachment[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.viewMeasurements");
  if (!guard.ok) return [];
  const attachments = await getMeasurementAttachmentsForCustomer(
    createAdminClient(),
    customerId
  );
  return withSignedUrls(attachments);
}

export async function uploadMeasurementAttachmentAction(
  formData: FormData
): Promise<ActionResult<MeasurementAttachment>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.editMeasurements");
  if (!guard.ok) return { success: false, error: guard.error };

  const customerId = String(formData.get("customerId") ?? "").trim();
  const garmentType = String(formData.get("garmentType") ?? "").trim();
  const attachmentType = String(formData.get("attachmentType") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const file = formData.get("file");

  if (!customerId) return { success: false, error: "Customer is required." };
  if (!MEASUREMENT_ATTACHMENT_TYPES.includes(attachmentType as MeasurementAttachmentType)) {
    return { success: false, error: "Select a valid attachment type." };
  }
  if (!(file instanceof File)) {
    return { success: false, error: "Choose a file to upload." };
  }
  if (file.size <= 0) return { success: false, error: "File is empty." };
  if (file.size > MAX_MEASUREMENT_ATTACHMENT_BYTES) {
    return { success: false, error: "File must be 10 MB or smaller." };
  }
  if (!ALLOWED_MEASUREMENT_ATTACHMENT_MIME_TYPES.has(file.type)) {
    return {
      success: false,
      error: "Only JPG, PNG, WebP, GIF, and PDF files are supported.",
    };
  }

  const admin = createAdminClient();
  const safeName = sanitizeStorageSegment(file.name) || "attachment";
  const path = `${customerId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await admin.storage
    .from(MEASUREMENT_ATTACHMENTS_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) return { success: false, error: uploadError.message };

  try {
    const attachment = await createMeasurementAttachment(admin, {
      customerId,
      garmentType,
      attachmentType: attachmentType as MeasurementAttachmentType,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      storagePath: path,
      notes,
      createdBy: guard.userId,
    });
    const [withUrl] = await withSignedUrls([attachment]);
    return { success: true, data: withUrl };
  } catch (error) {
    await admin.storage.from(MEASUREMENT_ATTACHMENTS_BUCKET).remove([path]);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to save attachment metadata.",
    };
  }
}

export async function deleteMeasurementAttachmentAction(
  id: string
): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.editMeasurements");
  if (!guard.ok) return { success: false, error: guard.error };

  const admin = createAdminClient();
  const attachment = await getMeasurementAttachmentById(admin, id);
  if (!attachment) return { success: false, error: "Attachment not found." };

  const { error: storageError } = await admin.storage
    .from(MEASUREMENT_ATTACHMENTS_BUCKET)
    .remove([attachment.storagePath]);
  if (storageError) return { success: false, error: storageError.message };

  await deleteMeasurementAttachment(admin, id);
  return { success: true, data: undefined };
}
