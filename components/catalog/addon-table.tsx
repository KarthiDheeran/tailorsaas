"use client";

import { Pencil, Power, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CatalogAddOn } from "@/lib/catalog";
import { useLanguage } from "@/components/i18n/language-provider";
import { formatCurrency } from "@/lib/currency";

export function AddOnTable({
  addOns,
  canManage = true,
  onEdit,
  onToggleActive,
}: {
  addOns: CatalogAddOn[];
  canManage?: boolean;
  onEdit: (addOn: CatalogAddOn) => void;
  onToggleActive: (addOn: CatalogAddOn) => void;
}) {
  const { t } = useLanguage();
  if (addOns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
        <Inbox className="mb-1 h-6 w-6 text-ink-faint" />
        <p className="text-sm text-ink-muted">{t("catalog.noAddOnsYet")}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">{t("catalog.addOnName")}</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">
              {t("catalog.defaultPrice")}
            </th>
            <th className="whitespace-nowrap px-5 py-3">Worker Pay</th>
            <th className="whitespace-nowrap px-5 py-3">{t("common.status")}</th>
            {canManage && (
              <th className="whitespace-nowrap px-5 py-3 text-right">
                {t("common.actions")}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {addOns.map((addOn) => (
            <tr
              key={addOn.id}
              className="border-t border-border-soft transition-colors hover:bg-surface-muted"
            >
              <td className="whitespace-nowrap px-5 py-3 font-semibold text-ink">
                {addOn.name}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                {formatCurrency(addOn.defaultPrice)}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {workerPaySummary(addOn)}
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                <span
                  className={cn(
                    "inline-block rounded-full px-3 py-1 text-xs font-semibold",
                    addOn.isActive
                      ? "bg-chip-mint text-chip-mint-fg"
                      : "bg-chip-info text-chip-info-fg"
                  )}
                >
                  {addOn.isActive ? t("common.active") : t("common.inactive")}
                </span>
              </td>
              {canManage && (
                <td className="whitespace-nowrap px-5 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      title={t("catalog.editAddOnTooltip")}
                      onClick={() => onEdit(addOn)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title={
                        addOn.isActive ? t("catalog.deactivateAddOn") : t("catalog.activateAddOn")
                      }
                      onClick={() => onToggleActive(addOn)}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface-muted",
                        addOn.isActive
                          ? "hover:text-chip-red-fg"
                          : "hover:text-chip-mint-fg"
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

function workerPaySummary(addOn: CatalogAddOn) {
  const entries = Object.entries(addOn.workerStageRates ?? {}).filter(
    ([, amount]) => Number(amount) > 0
  );
  if (entries.length === 0) return "-";
  return entries
    .map(([stage, amount]) => `${stage}: ${formatCurrency(Number(amount))}`)
    .join(", ");
}
