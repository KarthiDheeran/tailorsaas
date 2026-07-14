import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OrderAttachment,
  OrderAttachmentType,
} from "@/lib/types";

export const ORDER_ATTACHMENTS_BUCKET = "order-attachments";

const ATTACHMENT_COLUMNS =
  "id, order_id, order_item_serial_no, attachment_type, file_name, mime_type, file_size, storage_path, notes, created_at";

interface OrderAttachmentRow {
  id: string;
  order_id: string;
  order_item_serial_no: number | null;
  attachment_type: OrderAttachmentType;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  notes: string | null;
  created_at: string;
}

function mapAttachment(row: OrderAttachmentRow): OrderAttachment {
  return {
    id: row.id,
    orderId: row.order_id,
    orderItemSerialNo: row.order_item_serial_no ?? undefined,
    attachmentType: row.attachment_type,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    storagePath: row.storage_path,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

export async function getOrderAttachments(
  supabase: SupabaseClient,
  orderId: string
): Promise<OrderAttachment[]> {
  const { data, error } = await supabase
    .from("order_attachments")
    .select(ATTACHMENT_COLUMNS)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as OrderAttachmentRow[]) ?? []).map(mapAttachment);
}

export async function createOrderAttachment(
  supabase: SupabaseClient,
  data: {
    orderId: string;
    orderItemSerialNo?: number;
    attachmentType: OrderAttachmentType;
    fileName: string;
    mimeType: string;
    fileSize: number;
    storagePath: string;
    notes?: string;
    createdBy?: string;
  }
): Promise<OrderAttachment> {
  const { data: row, error } = await supabase
    .from("order_attachments")
    .insert({
      order_id: data.orderId,
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
  if (error) throw error;
  return mapAttachment(row as OrderAttachmentRow);
}

export async function getOrderAttachmentById(
  supabase: SupabaseClient,
  id: string
): Promise<OrderAttachment | undefined> {
  const { data, error } = await supabase
    .from("order_attachments")
    .select(ATTACHMENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapAttachment(data as OrderAttachmentRow) : undefined;
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
