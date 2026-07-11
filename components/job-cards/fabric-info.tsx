"use client";

import type { JobCard } from "@/lib/job-cards";
import type { CustomerFabric } from "@/lib/types";
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
}: {
  card: JobCard;
  linkedFabrics: CustomerFabric[];
  compact?: boolean;
}) {
  const hasCardFabric =
    card.fabricSource != null && card.fabricSource !== "Not specified";
  const hasLinkedFabrics = linkedFabrics.length > 0;

  if (!hasCardFabric && !hasLinkedFabrics) {
    return <span className="text-xs text-ink-faint">Not specified</span>;
  }

  return (
    <div className={cn("space-y-1", compact ? "text-[11px]" : "text-xs")}>
      {hasCardFabric && (
        <div>
          <span className="font-semibold text-ink">{card.fabricSource}</span>
          {card.fabricNotes && (
            <div className="max-w-[220px] whitespace-normal text-ink-muted">
              {card.fabricNotes}
            </div>
          )}
        </div>
      )}
      {hasLinkedFabrics && (
        <div className="space-y-1">
          {linkedFabrics.slice(0, compact ? 1 : 2).map((fabric) => (
            <div key={fabric.id} className="max-w-[240px] whitespace-normal text-ink-muted">
              <span className="font-medium text-ink">{fabric.fabricDescription}</span>
              {fabric.color ? `, ${fabric.color}` : ""} · {fabric.quantity} {fabric.unit} ·{" "}
              {fabric.status}
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
