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
import { cn } from "@/lib/utils";

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
  queued,
  onQueuedChange,
  existing = [],
  removedExistingIds = [],
  onRemovedExistingIdsChange,
  error,
  embedded = false,
  inlineSummary = false,
}: {
  queued: QueuedOrderAttachment[];
  onQueuedChange: (attachments: QueuedOrderAttachment[]) => void;
  existing?: EditableOrderAttachment[];
  removedExistingIds?: string[];
  onRemovedExistingIdsChange?: (ids: string[]) => void;
  error?: string | null;
  embedded?: boolean;
  inlineSummary?: boolean;
}) {
  const [preview, setPreview] = useState<{ src: string; name: string } | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const visibleExisting = existing.filter(
    (attachment) => !removedExistingIds.includes(attachment.id)
  );
  const attachmentCount = visibleExisting.length + queued.length;

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

  function removeQueued(id: string) {
    const attachment = queued.find((item) => item.id === id);
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    onQueuedChange(queued.filter((item) => item.id !== id));
  }

  function removeExisting(id: string) {
    if (!window.confirm("Remove this attachment when saving changes?")) return;
    onRemovedExistingIdsChange?.([...removedExistingIds, id]);
  }

  const summaryAttachments = [
    ...visibleExisting.map((attachment) => ({
      id: attachment.id,
      name: attachment.fileName,
      size: attachment.fileSize,
      previewUrl: attachment.signedUrl,
      image: isImage(attachment),
      onPreview: () =>
        attachment.signedUrl &&
        isImage(attachment) &&
        setPreview({ src: attachment.signedUrl, name: attachment.fileName }),
    })),
    ...queued.map((attachment) => ({
      id: attachment.id,
      name: attachment.file.name,
      size: attachment.file.size,
      previewUrl: attachment.previewUrl,
      image: Boolean(attachment.previewUrl),
      onPreview: () =>
        attachment.previewUrl &&
        setPreview({ src: attachment.previewUrl, name: attachment.file.name }),
    })),
  ];

  return (
    <div
      className={cn(
        embedded
          ? ""
          : cn(
              "rounded-xl border border-border-soft bg-white shadow-soft",
              inlineSummary ? "flex h-full flex-col justify-center p-3.5" : "p-3"
            )
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("font-semibold text-ink", inlineSummary ? "text-[15px]" : "text-[13px]")}>
            {inlineSummary
              ? `Attachments - ${attachmentCount} ${attachmentCount === 1 ? "file" : "files"}`
              : `Photos - ${attachmentCount}`}
          </span>
          {summaryAttachments.length > 0 && (
            <div className="flex min-w-0 items-center">
              {summaryAttachments.slice(0, 3).map((attachment, index) => (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={attachment.onPreview}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center overflow-hidden rounded-md border border-border-soft bg-surface",
                    index > 0 && "-ml-2"
                  )}
                  title={attachment.name}
                >
                  {attachment.image && attachment.previewUrl ? (
                    <Image
                      src={attachment.previewUrl}
                      alt={attachment.name}
                      width={32}
                      height={32}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-ink-faint" />
                  )}
                </button>
              ))}
              {summaryAttachments.length > 3 && (
                <span className="-ml-2 flex h-8 w-8 items-center justify-center rounded-md border border-border-soft bg-white text-[11px] font-semibold text-ink-muted">
                  +{summaryAttachments.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
        {(attachmentCount > 0 || inlineSummary) && (
          <button
            type="button"
            onClick={() => setManagerOpen(true)}
            className="h-8 shrink-0 rounded-md border border-border bg-white px-2.5 text-xs font-semibold text-ink transition-colors hover:bg-surface"
          >
            {inlineSummary ? "Manage attachments" : "Manage"}
          </button>
        )}
        <label
          className={cn(
            "h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-white px-2.5 text-xs font-semibold text-ink transition-colors hover:bg-surface",
            inlineSummary ? "hidden" : "flex"
          )}
        >
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

      {inlineSummary && attachmentCount === 0 && (
        <p className="mt-2 text-sm text-ink-muted">No files attached</p>
      )}

      {error && (
        <p className="mt-2 rounded-lg bg-chip-red px-3 py-2 text-sm font-medium text-chip-red-fg">
          {error}
        </p>
      )}

      {!inlineSummary && (
        <div className="mt-2 flex min-h-10 items-center justify-between gap-2">
        {summaryAttachments.length > 0 ? (
          <div className="flex min-w-0 items-center">
            {summaryAttachments.slice(0, 3).map((attachment, index) => (
              <button
                key={attachment.id}
                type="button"
                onClick={attachment.onPreview}
                className={cn(
                  "flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-border-soft bg-surface",
                  index > 0 && "-ml-2"
                )}
                title={attachment.name}
              >
                {attachment.image && attachment.previewUrl ? (
                  <Image
                    src={attachment.previewUrl}
                    alt={attachment.name}
                    width={40}
                    height={40}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon className="h-4 w-4 text-ink-faint" />
                )}
              </button>
            ))}
            {summaryAttachments.length > 3 && (
              <span className="-ml-2 flex h-10 w-10 items-center justify-center rounded-md border border-border-soft bg-white text-xs font-semibold text-ink-muted">
                +{summaryAttachments.length - 3}
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-ink-muted">No photos attached</span>
        )}
        <button
          type="button"
          onClick={() => setManagerOpen(true)}
          className="h-8 shrink-0 rounded-md border border-border bg-white px-2.5 text-xs font-semibold text-ink transition-colors hover:bg-surface"
        >
          View/Edit
        </button>
        </div>
      )}

      {managerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border-soft bg-white shadow-soft">
            <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
              <h3 className="text-[17px] font-semibold text-ink">Photos</h3>
              <button
                type="button"
                onClick={() => setManagerOpen(false)}
                aria-label="Close attachment manager"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mb-3 flex justify-end">
                <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface">
                  <FileUp className="h-4 w-4" />
                  Add more files
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
              {attachmentCount === 0 ? (
                <p className="text-sm text-ink-muted">No attachments selected.</p>
              ) : (
                <div className="space-y-2">
                  {visibleExisting.map((attachment) => (
                    <div
                      key={attachment.id}
                      id={`attachment-${attachment.id}`}
                      tabIndex={-1}
                      className="grid items-center gap-2 rounded-lg border border-border-soft bg-surface/40 p-2 sm:grid-cols-[56px_minmax(140px,1fr)_auto]"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          attachment.signedUrl &&
                          isImage(attachment) &&
                          setPreview({ src: attachment.signedUrl, name: attachment.fileName })
                        }
                        disabled={!attachment.signedUrl || !isImage(attachment)}
                        className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border border-border-soft bg-surface disabled:cursor-default"
                      >
                        {isImage(attachment) && attachment.signedUrl ? (
                          <Image
                            src={attachment.signedUrl}
                            alt={attachment.fileName}
                            width={56}
                            height={56}
                            unoptimized
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-ink-faint" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{attachment.fileName}</p>
                        <p className="text-xs text-ink-muted">{formatFileSize(attachment.fileSize)}</p>
                      </div>
                      <div className="flex justify-end gap-1.5">
                        {attachment.signedUrl && (
                          <a
                            href={attachment.signedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open attachment"
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => removeExisting(attachment.id)}
                          title="Remove attachment"
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-ink-muted transition-colors hover:bg-chip-red hover:text-chip-red-fg"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {queued.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="grid items-center gap-2 rounded-lg border border-border-soft bg-surface/40 p-2 sm:grid-cols-[56px_minmax(140px,1fr)_auto]"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          attachment.previewUrl &&
                          setPreview({ src: attachment.previewUrl, name: attachment.file.name })
                        }
                        disabled={!attachment.previewUrl}
                        className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border border-border-soft bg-surface disabled:cursor-default"
                      >
                        {attachment.previewUrl ? (
                          <Image
                            src={attachment.previewUrl}
                            alt={attachment.file.name}
                            width={56}
                            height={56}
                            unoptimized
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-ink-faint" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{attachment.file.name}</p>
                        <p className="text-xs text-ink-muted">{formatFileSize(attachment.file.size)}</p>
                        {attachment.error && (
                          <p className="truncate text-xs font-medium text-chip-red-fg">{attachment.error}</p>
                        )}
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeQueued(attachment.id)}
                          title="Remove queued file"
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-ink-muted transition-colors hover:bg-chip-red hover:text-chip-red-fg"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end border-t border-border-soft px-4 py-3">
              <button
                type="button"
                onClick={() => setManagerOpen(false)}
                className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
              >
                Done
              </button>
            </div>
          </div>
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
