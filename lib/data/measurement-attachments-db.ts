import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MeasurementAttachment,
  MeasurementAttachmentType,
} from "@/lib/types";

export const MEASUREMENT_ATTACHMENTS_BUCKET = "measurement-attachments";

const ATTACHMENT_COLUMNS =
  "id, customer_id, garment_type, attachment_type, file_name, mime_type, file_size, storage_path, notes, created_at";

interface MeasurementAttachmentRow {
  id: string;
  customer_id: string;
  garment_type: string | null;
  attachment_type: MeasurementAttachmentType;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  notes: string | null;
  created_at: string;
}

function mapAttachment(row: MeasurementAttachmentRow): MeasurementAttachment {
  return {
    id: row.id,
    customerId: row.customer_id,
    garmentType: row.garment_type ?? undefined,
    attachmentType: row.attachment_type,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    storagePath: row.storage_path,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

export async function getMeasurementAttachmentsForCustomer(
  supabase: SupabaseClient,
  customerId: string
): Promise<MeasurementAttachment[]> {
  const { data, error } = await supabase
    .from("measurement_attachments")
    .select(ATTACHMENT_COLUMNS)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as MeasurementAttachmentRow[]) ?? []).map(mapAttachment);
}

export async function createMeasurementAttachment(
  supabase: SupabaseClient,
  data: {
    customerId: string;
    garmentType?: string;
    attachmentType: MeasurementAttachmentType;
    fileName: string;
    mimeType: string;
    fileSize: number;
    storagePath: string;
    notes?: string;
    createdBy?: string;
  }
): Promise<MeasurementAttachment> {
  const { data: row, error } = await supabase
    .from("measurement_attachments")
    .insert({
      customer_id: data.customerId,
      garment_type: data.garmentType?.trim() || null,
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
  return mapAttachment(row as MeasurementAttachmentRow);
}

export async function getMeasurementAttachmentById(
  supabase: SupabaseClient,
  id: string
): Promise<MeasurementAttachment | undefined> {
  const { data, error } = await supabase
    .from("measurement_attachments")
    .select(ATTACHMENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapAttachment(data as MeasurementAttachmentRow) : undefined;
}

export async function deleteMeasurementAttachment(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("measurement_attachments")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
