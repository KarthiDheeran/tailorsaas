"use client";

import { useRef, useState } from "react";
import { ExternalLink, FileUp, Trash2 } from "lucide-react";
import {
  deleteMeasurementAttachmentAction,
  uploadMeasurementAttachmentAction,
} from "@/app/(shell)/customers/actions";
import type {
  MeasurementAttachment,
  MeasurementAttachmentType,
} from "@/lib/types";

const ATTACHMENT_TYPES: MeasurementAttachmentType[] = [
  "Fit Photo",
  "Sketch",
  "Reference",
  "Alteration Mark",
  "Other",
];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function MeasurementAttachmentsCard({
  customerId,
  attachments,
  onAttachmentsChange,
}: {
  customerId: string;
  attachments: MeasurementAttachment[];
  onAttachmentsChange: (attachments: MeasurementAttachment[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachmentType, setAttachmentType] =
    useState<MeasurementAttachmentType>("Fit Photo");
  const [garmentType, setGarmentType] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }

    setError(null);
    setUploading(true);
    const formData = new FormData();
    formData.append("customerId", customerId);
    formData.append("attachmentType", attachmentType);
    formData.append("garmentType", garmentType);
    formData.append("notes", notes);
    formData.append("file", file);

    const result = await uploadMeasurementAttachmentAction(formData);
    setUploading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onAttachmentsChange([result.data, ...attachments]);
    setGarmentType("");
    setNotes("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDelete(attachment: MeasurementAttachment) {
    if (!window.confirm(`Delete ${attachment.fileName}?`)) return;
    setError(null);
    setDeletingId(attachment.id);
    const result = await deleteMeasurementAttachmentAction(attachment.id);
    setDeletingId(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onAttachmentsChange(attachments.filter((item) => item.id !== attachment.id));
  }

  return (
    <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <h2 className="mb-4 text-[17px] font-semibold text-ink">
        Photos & Sketches
      </h2>

      <div className="space-y-3 rounded-lg border border-border-soft bg-surface-muted/40 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-muted">
              Type
            </span>
            <select
              value={attachmentType}
              onChange={(event) =>
                setAttachmentType(event.target.value as MeasurementAttachmentType)
              }
              className="h-10 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            >
              {ATTACHMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-muted">
              Garment
            </span>
            <input
              value={garmentType}
              onChange={(event) => setGarmentType(event.target.value)}
              placeholder="Blouse, shirt, alteration..."
              className="h-10 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">
            Notes
          </span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            placeholder="Back neck sketch, left shoulder mark, reference photo..."
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            className="min-w-0 flex-1 text-sm text-ink-muted file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-white file:px-3 file:text-sm file:font-semibold file:text-ink"
          />
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            <FileUp className="h-4 w-4" />
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
        {error && (
          <p className="text-sm font-medium text-chip-red-fg">{error}</p>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {attachments.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No photos or sketches attached yet.
          </p>
        ) : (
          attachments.map((attachment) => (
            <article
              key={attachment.id}
              className="rounded-lg border border-border-soft bg-white p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary-tint px-2.5 py-1 text-xs font-semibold text-primary">
                      {attachment.attachmentType}
                    </span>
                    {attachment.garmentType && (
                      <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-ink-muted">
                        {attachment.garmentType}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-ink">
                    {attachment.fileName}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {formatFileSize(attachment.fileSize)} -{" "}
                    {formatDateTime(attachment.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {attachment.signedUrl && (
                    <a
                      href={attachment.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open attachment"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(attachment)}
                    disabled={deletingId === attachment.id}
                    title="Delete attachment"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-chip-red hover:text-chip-red-fg disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {attachment.mimeType.startsWith("image/") && attachment.signedUrl && (
                <div
                  role="img"
                  aria-label={attachment.fileName}
                  className="mt-3 h-48 w-full rounded-lg border border-border-soft bg-cover bg-center"
                  style={{ backgroundImage: `url(${attachment.signedUrl})` }}
                />
              )}
              {attachment.notes && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">
                  {attachment.notes}
                </p>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
