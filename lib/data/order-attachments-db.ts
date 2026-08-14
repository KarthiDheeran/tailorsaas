import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OrderAttachment,
  OrderAttachmentType,
} from "@/lib/types";

export const ORDER_ATTACHMENTS_BUCKET = "order-attachments";

const ATTACHMENT_COLUMNS =
  "id, order_id, order_item_id, order_item_serial_no, attachment_type, file_name, mime_type, file_size, storage_provider, storage_path, notes, created_at";

const LEGACY_ATTACHMENT_COLUMNS =
  "id, order_id, order_item_serial_no, attachment_type, file_name, mime_type, file_size, storage_path, notes, created_at";

interface OrderAttachmentRow {
  id: string;
  order_id: string;
  order_item_id?: string | null;
  order_item_serial_no: number | null;
  attachment_type: OrderAttachmentType;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_provider?: "supabase" | "local" | null;
  storage_path: string;
  notes: string | null;
  created_at: string;
}

function mapAttachment(row: OrderAttachmentRow): OrderAttachment {
  return {
    id: row.id,
    orderId: row.order_id,
    orderItemId: row.order_item_id ?? undefined,
    orderItemSerialNo: row.order_item_serial_no ?? undefined,
    attachmentType: row.attachment_type,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    storageProvider: row.storage_provider ?? "supabase",
    storagePath: row.storage_path,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

function isMissingOrderItemIdSchemaError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    candidate.code === "PGRST204" ||
    message.includes("order_item_id") ||
    message.includes("schema cache")
  );
}

export async function getOrderAttachments(
  supabase: SupabaseClient,
  orderId: string
): Promise<OrderAttachment[]> {
  let { data, error } = await supabase
    .from("order_attachments")
    .select(ATTACHMENT_COLUMNS)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error && isMissingOrderItemIdSchemaError(error)) {
    const fallback = await supabase
      .from("order_attachments")
      .select(LEGACY_ATTACHMENT_COLUMNS)
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  return ((data as OrderAttachmentRow[]) ?? []).map(mapAttachment);
}

export async function createOrderAttachment(
  supabase: SupabaseClient,
  data: {
    orderId: string;
    orderItemId?: string;
    orderItemSerialNo?: number;
    attachmentType: OrderAttachmentType;
    fileName: string;
    mimeType: string;
    fileSize: number;
    storageProvider?: "supabase" | "local";
    storagePath: string;
    notes?: string;
    createdBy?: string;
  }
): Promise<OrderAttachment> {
  let { data: row, error } = await supabase
    .from("order_attachments")
    .insert({
      order_id: data.orderId,
      order_item_id: data.orderItemId ?? null,
      order_item_serial_no: data.orderItemSerialNo ?? null,
      attachment_type: data.attachmentType,
      file_name: data.fileName,
      mime_type: data.mimeType,
      file_size: data.fileSize,
      storage_path: data.storagePath,
      notes: data.notes?.trim() || null,
      created_by: data.createdBy ?? null,
    })
    .select(ATTACHMENT_COLUMNS)
    .single();
  if (error && isMissingOrderItemIdSchemaError(error)) {
    const fallback = await supabase
      .from("order_attachments")
      .insert({
        order_id: data.orderId,
        order_item_serial_no: data.orderItemSerialNo ?? null,
        attachment_type: data.attachmentType,
        file_name: data.fileName,
        mime_type: data.mimeType,
        file_size: data.fileSize,
        storage_provider: data.storageProvider ?? "supabase",
        storage_path: data.storagePath,
        notes: data.notes?.trim() || null,
        created_by: data.createdBy ?? null,
      })
      .select(LEGACY_ATTACHMENT_COLUMNS)
      .single();
    row = fallback.data as unknown as typeof row;
    error = fallback.error;
  }
  if (error) throw error;
  return mapAttachment(row as OrderAttachmentRow);
}

export async function getOrderAttachmentById(
  supabase: SupabaseClient,
  id: string
): Promise<OrderAttachment | undefined> {
  let { data, error } = await supabase
    .from("order_attachments")
    .select(ATTACHMENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error && isMissingOrderItemIdSchemaError(error)) {
    const fallback = await supabase
      .from("order_attachments")
      .select(LEGACY_ATTACHMENT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  return data ? mapAttachment(data as OrderAttachmentRow) : undefined;
}

export async function updateOrderAttachment(
  supabase: SupabaseClient,
  id: string,
  data: {
    orderItemSerialNo?: number;
    orderItemId?: string;
    attachmentType: OrderAttachmentType;
    notes?: string;
  }
): Promise<OrderAttachment | undefined> {
  let { data: row, error } = await supabase
    .from("order_attachments")
    .update({
      order_item_serial_no: data.orderItemSerialNo ?? null,
      order_item_id: data.orderItemId ?? null,
      attachment_type: data.attachmentType,
      notes: data.notes?.trim() || null,
    })
    .eq("id", id)
    .select(ATTACHMENT_COLUMNS)
    .maybeSingle();
  if (error && isMissingOrderItemIdSchemaError(error)) {
    const fallback = await supabase
      .from("order_attachments")
      .update({
        order_item_serial_no: data.orderItemSerialNo ?? null,
        attachment_type: data.attachmentType,
        notes: data.notes?.trim() || null,
      })
      .eq("id", id)
      .select(LEGACY_ATTACHMENT_COLUMNS)
      .maybeSingle();
    row = fallback.data as unknown as typeof row;
    error = fallback.error;
  }
  if (error) throw error;
  return row ? mapAttachment(row as OrderAttachmentRow) : undefined;
}

export async function deleteOrderAttachment(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("order_attachments")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
