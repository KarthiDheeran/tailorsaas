"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ExternalLink, FileUp, ImageIcon, Trash2, X } from "lucide-react";
import type { OrderAttachment, OrderAttachmentType } from "@/lib/types";
import {
  deleteOrderAttachmentAction,
  updateOrderAttachmentAction,
  uploadOrderAttachmentAction,
} from "@/app/(shell)/orders/actions";
import { Select } from "@/components/ui/select";

export const ORDER_ATTACHMENT_TYPES: OrderAttachmentType[] = [
  "Design Reference",
  "Fabric Photo",
  "Sample Photo",
  "Trial Photo",
  "Alteration Photo",
  "Final Garment Photo",
  "Other",
];

export const ORDER_ATTACHMENT_HELP: Record<OrderAttachmentType, string> = {
  "Design Reference": "Customer-approved inspiration or WhatsApp/Pinterest/Instagram reference.",
  "Fabric Photo": "Fabric, border, lining, trims, or customer-provided material.",
  "Sample Photo": "Existing garment or sample to copy.",
  "Trial Photo": "Trial fitting photos and visible correction points.",
  "Alteration Photo": "Before/after alteration or repair evidence.",
  "Final Garment Photo": "Finished garment photo before pickup or delivery.",
  Other: "Any supporting file for this order.",
};

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const MAX_BYTES = 10 * 1024 * 1024;

export interface AttachmentItemOption {
  key: string;
  label: string;
  orderItemId?: string;
  serialNo?: number;
}

export interface QueuedOrderAttachment {
  id: string;
  file: File;
  previewUrl?: string;
  attachmentType: OrderAttachmentType;
  orderItemKey: string;
  notes: string;
  error?: string;
}

export interface EditableOrderAttachment extends OrderAttachment {
  orderItemKey: string;
}

export interface AttachmentUploadFailure {
  id: string;
  fileName: string;
  error: string;
}

export interface AttachmentUploadResult {
  failures: AttachmentUploadFailure[];
  uploadedCount: number;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(file: File | OrderAttachment) {
  return file instanceof File
    ? file.type.startsWith("image/")
    : file.mimeType.startsWith("image/");
}

function attachmentItemLabel(options: AttachmentItemOption[], key: string) {
  if (!key) return "Whole order";
  return options.find((option) => option.key === key)?.label ?? "Reassign item";
}

function validateFile(file: File): string | null {
  if (file.size <= 0) return "File is empty.";
  if (file.size > MAX_BYTES) return "File must be 10 MB or smaller.";
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return "Only JPG, PNG, WebP, GIF, and PDF files are supported.";
  }
  return null;
}

export function makeEditableOrderAttachment(
  attachment: OrderAttachment
): EditableOrderAttachment {
  return {
    ...attachment,
    orderItemKey: attachment.orderItemId
      ? `item-${attachment.orderItemId}`
      : attachment.orderItemSerialNo
        ? `saved-${attachment.orderItemSerialNo}`
      : "",
  };
}

export async function uploadQueuedOrderAttachmentsDetailed({
  orderId,
  queued,
  itemOptions,
}: {
  orderId: string;
  queued: QueuedOrderAttachment[];
  itemOptions: AttachmentItemOption[];
}): Promise<AttachmentUploadResult> {
  const failures: AttachmentUploadFailure[] = [];
  let uploadedCount = 0;
  for (const attachment of queued) {
    const option = attachment.orderItemKey
      ? itemOptions.find((candidate) => candidate.key === attachment.orderItemKey)
      : undefined;
    if (attachment.orderItemKey && !option?.orderItemId) {
      failures.push({
        id: attachment.id,
        fileName: attachment.file.name,
        error: "Select a valid garment item.",
      });
      continue;
    }
    const formData = new FormData();
    formData.append("orderId", orderId);
    formData.append("orderItemId", option?.orderItemId ?? "");
    formData.append("orderItemSerialNo", option?.serialNo ? String(option.serialNo) : "");
    formData.append("attachmentType", attachment.attachmentType);
    formData.append("notes", attachment.notes);
    formData.append("file", attachment.file);
    const result = await uploadOrderAttachmentAction(formData);
    if (!result.success) {
      failures.push({
        id: attachment.id,
        fileName: attachment.file.name,
        error: result.error,
      });
    } else {
      uploadedCount += 1;
    }
  }
  return { failures, uploadedCount };
}

export async function uploadQueuedOrderAttachments({
  orderId,
  queued,
  itemOptions,
}: {
  orderId: string;
  queued: QueuedOrderAttachment[];
  itemOptions: AttachmentItemOption[];
}): Promise<string[]> {
  const result = await uploadQueuedOrderAttachmentsDetailed({
    orderId,
    queued,
    itemOptions,
  });
  return result.failures.map((failure) => `${failure.fileName}: ${failure.error}`);
}

export async function persistEditableOrderAttachments({
  attachments,
  removedIds,
  itemOptions,
}: {
  attachments: EditableOrderAttachment[];
  removedIds: string[];
  itemOptions: AttachmentItemOption[];
}): Promise<string[]> {
  const failures: string[] = [];
  for (const attachment of attachments) {
    const option = attachment.orderItemKey
      ? itemOptions.find((candidate) => candidate.key === attachment.orderItemKey)
      : undefined;
    if (attachment.orderItemKey && !option?.orderItemId) {
      failures.push(`${attachment.fileName}: select a valid garment item.`);
      continue;
    }
    const result = await updateOrderAttachmentAction({
      id: attachment.id,
      attachmentType: attachment.attachmentType,
      orderItemId: option?.orderItemId,
      orderItemSerialNo: option?.serialNo,
      notes: attachment.notes,
    });
    if (!result.success) failures.push(`${attachment.fileName}: ${result.error}`);
  }
  for (const id of removedIds) {
    const result = await deleteOrderAttachmentAction(id);
    if (!result.success) failures.push(`Attachment delete failed: ${result.error}`);
  }
  return failures;
}

export async function detachEditableOrderAttachments(
  attachments: EditableOrderAttachment[]
): Promise<string[]> {
  const failures: string[] = [];
  for (const attachment of attachments) {
    if (!attachment.orderItemKey) continue;
    const result = await updateOrderAttachmentAction({
      id: attachment.id,
      attachmentType: attachment.attachmentType,
      notes: attachment.notes,
    });
    if (!result.success) failures.push(`${attachment.fileName}: ${result.error}`);
  }
  return failures;
}

export function OrderAttachmentDraftCard({
  itemOptions,
  queued,
  onQueuedChange,
  existing = [],
  onExistingChange,
  removedExistingIds = [],
  onRemovedExistingIdsChange,
  error,
}: {
  itemOptions: AttachmentItemOption[];
  queued: QueuedOrderAttachment[];
  onQueuedChange: (attachments: QueuedOrderAttachment[]) => void;
  existing?: EditableOrderAttachment[];
  onExistingChange?: (attachments: EditableOrderAttachment[]) => void;
  removedExistingIds?: string[];
  onRemovedExistingIdsChange?: (ids: string[]) => void;
  error?: string | null;
}) {
  const [preview, setPreview] = useState<{ src: string; name: string } | null>(null);
  const visibleExisting = existing.filter(
    (attachment) => !removedExistingIds.includes(attachment.id)
  );

  useEffect(() => {
    if (!preview) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPreview(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [preview]);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#attachment-")) return;
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
  }, [visibleExisting.length]);

  function handleAddFiles(files: FileList | null) {
    if (!files) return;
    const additions = Array.from(files).map((file) => {
      const validationError = validateFile(file);
      return {
        id: `queued-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        attachmentType: "Design Reference" as OrderAttachmentType,
        orderItemKey: "",
        notes: "",
        error: validationError ?? undefined,
      };
    });
    onQueuedChange([...queued, ...additions]);
  }

  function updateQueued(id: string, patch: Partial<QueuedOrderAttachment>) {
    onQueuedChange(queued.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeQueued(id: string) {
    const attachment = queued.find((item) => item.id === id);
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    onQueuedChange(queued.filter((item) => item.id !== id));
  }

  function updateExisting(id: string, patch: Partial<EditableOrderAttachment>) {
    onExistingChange?.(
      existing.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function removeExisting(id: string) {
    if (!window.confirm("Remove this attachment when saving changes?")) return;
    onRemovedExistingIdsChange?.([...removedExistingIds, id]);
  }

  return (
    <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-semibold text-ink">Attachments / Photos</h3>
          <p className="text-sm text-ink-muted">Optional references for this order.</p>
        </div>
        <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface">
          <FileUp className="h-4 w-4" />
          Add files
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={(event) => {
              handleAddFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-chip-red px-3 py-2 text-sm font-medium text-chip-red-fg">
          {error}
        </p>
      )}

      {visibleExisting.length === 0 && queued.length === 0 ? (
        <p className="text-sm text-ink-muted">No attachments selected.</p>
      ) : (
        <div className="space-y-3">
          {visibleExisting.map((attachment) => (
            <div
              key={attachment.id}
              id={`attachment-${attachment.id}`}
              tabIndex={-1}
              className="rounded-lg border border-border-soft bg-surface/40 p-3"
            >
              <div className="grid gap-3 md:grid-cols-[72px_1fr_auto]">
                <button
                  type="button"
                  onClick={() =>
                    attachment.signedUrl &&
                    isImage(attachment) &&
                    setPreview({ src: attachment.signedUrl, name: attachment.fileName })
                  }
                  disabled={!attachment.signedUrl || !isImage(attachment)}
                  title={isImage(attachment) ? "Preview attachment" : undefined}
                  className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-border-soft bg-surface disabled:cursor-default"
                >
                  {isImage(attachment) && attachment.signedUrl ? (
                    <Image
                      src={attachment.signedUrl}
                      alt={attachment.fileName}
                      width={64}
                      height={64}
                      unoptimized
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-ink-faint" />
                  )}
                </button>
                <div className="min-w-0 space-y-2">
                  <div className="truncate text-sm font-semibold text-ink">
                    {attachment.fileName}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select
                      value={attachment.attachmentType}
                      onChange={(event) =>
                        updateExisting(attachment.id, {
                          attachmentType: event.target.value as OrderAttachmentType,
                        })
                      }
                    >
                      {ORDER_ATTACHMENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </Select>
                    <Select
                      value={attachment.orderItemKey}
                      onChange={(event) =>
                        updateExisting(attachment.id, { orderItemKey: event.target.value })
                      }
                    >
                      <option value="">Whole order</option>
                      {itemOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <input
                    value={attachment.notes ?? ""}
                    onChange={(event) =>
                      updateExisting(attachment.id, { notes: event.target.value })
                    }
                    placeholder="Notes"
                    className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                  />
                </div>
                <div className="flex items-start gap-1.5">
                  {attachment.signedUrl && (
                    <a
                      href={attachment.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open attachment"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => removeExisting(attachment.id)}
                    title="Remove attachment"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-ink-muted transition-colors hover:bg-chip-red hover:text-chip-red-fg"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {queued.map((attachment) => (
            <div
              key={attachment.id}
              className="rounded-lg border border-border-soft bg-surface/40 p-3"
            >
              <div className="grid gap-3 md:grid-cols-[72px_1fr_auto]">
                <button
                  type="button"
                  onClick={() =>
                    attachment.previewUrl &&
                    setPreview({ src: attachment.previewUrl, name: attachment.file.name })
                  }
                  disabled={!attachment.previewUrl}
                  title={attachment.previewUrl ? "Preview attachment" : undefined}
                  className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-border-soft bg-surface disabled:cursor-default"
                >
                  {attachment.previewUrl ? (
                    <Image
                      src={attachment.previewUrl}
                      alt={attachment.file.name}
                      width={64}
                      height={64}
                      unoptimized
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-ink-faint" />
                  )}
                </button>
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink">
                      {attachment.file.name}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {formatFileSize(attachment.file.size)}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select
                      value={attachment.attachmentType}
                      onChange={(event) =>
                        updateQueued(attachment.id, {
                          attachmentType: event.target.value as OrderAttachmentType,
                        })
                      }
                    >
                      {ORDER_ATTACHMENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </Select>
                    <Select
                      value={attachment.orderItemKey}
                      onChange={(event) =>
                        updateQueued(attachment.id, { orderItemKey: event.target.value })
                      }
                    >
                      <option value="">Whole order</option>
                      {itemOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <input
                    value={attachment.notes}
                    onChange={(event) =>
                      updateQueued(attachment.id, { notes: event.target.value })
                    }
                    placeholder="Notes"
                    className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                  />
                  {attachment.error && (
                    <p className="text-xs font-medium text-chip-red-fg">
                      {attachment.error}
                    </p>
                  )}
                  {attachment.orderItemKey &&
                    !itemOptions.some((option) => option.key === attachment.orderItemKey) && (
                      <p className="text-xs font-medium text-chip-red-fg">
                        The linked item was removed. Reassign or remove this file.
                      </p>
                    )}
                  <p className="text-xs text-ink-muted">
                    {attachmentItemLabel(itemOptions, attachment.orderItemKey)}
                  </p>
                </div>
                <div className="flex items-start">
                  <button
                    type="button"
                    onClick={() => removeQueued(attachment.id)}
                    title="Remove queued file"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-ink-muted transition-colors hover:bg-chip-red hover:text-chip-red-fg"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border-soft bg-white shadow-soft">
            <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
              <p className="min-w-0 truncate text-sm font-semibold text-ink">
                {preview.name}
              </p>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Close preview"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative h-[calc(100vh-8rem)] min-h-0 bg-surface">
              <Image
                src={preview.src}
                alt={preview.name}
                fill
                unoptimized
                sizes="100vw"
                className="object-contain p-3"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
