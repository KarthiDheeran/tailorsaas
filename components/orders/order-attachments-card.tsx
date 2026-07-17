"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink, ImageIcon, Pencil, X } from "lucide-react";
import type { Order, OrderAttachment } from "@/lib/types";

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

function itemLabel(order: Order, attachment: OrderAttachment) {
  const item = attachment.orderItemId
    ? order.items.find((candidate) => candidate.id === attachment.orderItemId)
    : attachment.orderItemSerialNo
      ? order.items.find((candidate) => candidate.serialNo === attachment.orderItemSerialNo)
      : undefined;
  if (!item) return undefined;
  return `Item ${item.serialNo} — ${item.particular}`;
}

export function OrderAttachmentsCard({
  order,
  attachments,
  canEdit,
}: {
  order: Order;
  attachments: OrderAttachment[];
  canEdit: boolean;
}) {
  const [previewAttachment, setPreviewAttachment] =
    useState<OrderAttachment | null>(null);

  useEffect(() => {
    if (!previewAttachment) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPreviewAttachment(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewAttachment]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-muted">
          Attachments / Photos
        </p>
        {canEdit && (
          <Link
            href={`/orders/${order.id}/edit#attachments`}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface"
          >
            <Pencil className="h-3.5 w-3.5" />
            Manage Attachments
          </Link>
        )}
      </div>

      <div className="space-y-3">
        {attachments.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No order photos or reference files attached yet.
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
                    <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink-muted">
                      {attachment.orderItemId || attachment.orderItemSerialNo
                        ? itemLabel(order, attachment) ?? "Item unavailable"
                        : "Whole order"}
                    </span>
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
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
              {attachment.mimeType.startsWith("image/") && attachment.signedUrl && (
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(attachment)}
                  className="mt-3 block w-full overflow-hidden rounded-lg border border-border-soft bg-surface text-left transition-colors hover:bg-surface"
                >
                  <div className="relative h-44 w-full bg-surface sm:h-56 lg:h-72">
                    <Image
                      src={attachment.signedUrl}
                      alt={attachment.fileName}
                      fill
                      unoptimized
                      sizes="(min-width: 640px) 640px, 100vw"
                      className="object-contain p-2"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 border-t border-border-soft px-3 py-2 text-xs font-medium text-ink-muted">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Preview photo
                  </div>
                </button>
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

      {previewAttachment?.signedUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border-soft bg-white shadow-soft">
            <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
              <p className="min-w-0 truncate text-sm font-semibold text-ink">
                {previewAttachment.fileName}
              </p>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                aria-label="Close preview"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative h-[calc(100vh-8rem)] min-h-0 bg-surface">
              <Image
                src={previewAttachment.signedUrl}
                alt={previewAttachment.fileName}
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
