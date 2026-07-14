"use client";

import type { JobCard } from "@/lib/job-cards";
import { customerFabricStatuses } from "@/lib/constants";
import type { CustomerFabric, CustomerFabricStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export type JobCardFabricSourceValue = NonNullable<JobCard["fabricSource"]>;

export const JOB_CARD_FABRIC_SOURCES: JobCardFabricSourceValue[] = [
  "Not specified",
  "Customer provided",
  "Shop provided",
];

export function FabricInfo({
  card,
  linkedFabrics,
  compact = false,
  canManageStatus = false,
  onStatusChange,
}: {
  card: JobCard;
  linkedFabrics: CustomerFabric[];
  compact?: boolean;
  canManageStatus?: boolean;
  onStatusChange?: (fabric: CustomerFabric, status: CustomerFabricStatus) => void;
}) {
  const hasCardFabric =
    (card.fabricSource != null && card.fabricSource !== "Not specified") ||
    !!card.fabricNotes ||
    !!card.designNotes;
  const hasLinkedFabrics = linkedFabrics.length > 0;

  if (!hasCardFabric && !hasLinkedFabrics) {
    return <span className="text-xs text-ink-faint">Not specified</span>;
  }

  return (
    <div className={cn("space-y-1", compact ? "text-[11px]" : "text-xs")}>
      {hasCardFabric && (
        <div>
          {card.fabricSource && card.fabricSource !== "Not specified" && (
            <span className="font-semibold text-ink">{card.fabricSource}</span>
          )}
          {card.fabricNotes && (
            <div className="max-w-[220px] whitespace-normal text-ink-muted">
              {card.fabricNotes}
            </div>
          )}
          {card.designNotes && (
            <div className="max-w-[220px] whitespace-normal text-ink-muted">
              Design: {card.designNotes}
            </div>
          )}
        </div>
      )}
      {hasLinkedFabrics && (
        <div className="space-y-1">
          {linkedFabrics.slice(0, compact ? 1 : 2).map((fabric) => (
            <div key={fabric.id} className="max-w-[240px] whitespace-normal text-ink-muted">
              <div>
                <span className="font-medium text-ink">{fabric.fabricDescription}</span>
                {fabric.color ? `, ${fabric.color}` : ""} · {fabric.quantity} {fabric.unit}
              </div>
              {canManageStatus && onStatusChange ? (
                <select
                  value={fabric.status}
                  onChange={(event) =>
                    onStatusChange(fabric, event.target.value as CustomerFabricStatus)
                  }
                  className="mt-1 h-7 max-w-full rounded border border-border bg-white px-2 text-[11px] font-semibold text-ink-muted outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                >
                  {customerFabricStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              ) : (
                <div>{fabric.status}</div>
              )}
            </div>
          ))}
          {linkedFabrics.length > (compact ? 1 : 2) && (
            <div className="text-ink-faint">
              +{linkedFabrics.length - (compact ? 1 : 2)} more fabric record
              {linkedFabrics.length - (compact ? 1 : 2) === 1 ? "" : "s"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
