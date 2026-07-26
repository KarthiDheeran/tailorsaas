"use client";

import { Pencil, Power, Inbox } from "lucide-react";
import type { CatalogWorkStage } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export function WorkStageTable({
  stages,
  canManage,
  onEdit,
  onToggleActive,
}: {
  stages: CatalogWorkStage[];
  canManage: boolean;
  onEdit: (stage: CatalogWorkStage) => void;
  onToggleActive: (stage: CatalogWorkStage) => void;
}) {
  if (stages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
        <Inbox className="mb-1 h-6 w-6 text-ink-faint" />
        <p className="text-sm text-ink-muted">No work stages configured yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">Stage</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">Order</th>
            <th className="whitespace-nowrap px-5 py-3">Status</th>
            {canManage && <th className="whitespace-nowrap px-5 py-3 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {stages.map((stage) => (
            <tr key={stage.id} className="border-t border-border-soft hover:bg-surface">
              <td className="whitespace-nowrap px-5 py-3 font-semibold text-ink">{stage.name}</td>
              <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                {stage.displayOrder}
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                <span
                  className={cn(
                    "inline-block rounded-full px-3 py-1 text-xs font-semibold",
                    stage.isActive
                      ? "bg-chip-mint text-chip-mint-fg"
                      : "bg-chip-info text-chip-info-fg"
                  )}
                >
                  {stage.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              {canManage && (
                <td className="whitespace-nowrap px-5 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      title="Edit stage"
                      onClick={() => onEdit(stage)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted hover:bg-surface hover:text-ink"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title={stage.isActive ? "Deactivate stage" : "Activate stage"}
                      onClick={() => onToggleActive(stage)}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted hover:bg-surface",
                        stage.isActive ? "hover:text-chip-red-fg" : "hover:text-chip-mint-fg"
                      )}
                    >
                      <Power className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
