"use client";

import { Pencil, Power, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CatalogGarmentType } from "@/lib/catalog";
import { useLanguage } from "@/components/i18n/language-provider";
import { formatCurrency } from "@/lib/currency";

export function CatalogTable({
  garmentTypes,
  metadataFieldCounts = {},
  canManage = true,
  onEdit,
  onToggleActive,
}: {
  garmentTypes: CatalogGarmentType[];
  metadataFieldCounts?: Record<string, number>;
  canManage?: boolean;
  onEdit: (garment: CatalogGarmentType) => void;
  onToggleActive: (garment: CatalogGarmentType) => void;
}) {
  const { t } = useLanguage();

  if (garmentTypes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
        <Inbox className="mb-1 h-6 w-6 text-ink-faint" />
        <p className="text-sm text-ink-muted">
          {t("catalog.noGarmentTypesYet")}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">
              {t("catalog.garmentTypes")}
            </th>
            <th className="whitespace-nowrap px-5 py-3">Code</th>
            <th className="whitespace-nowrap px-5 py-3">Section</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">
              {t("catalog.basePrice")}
            </th>
            <th className="whitespace-nowrap px-5 py-3">
              {t("catalog.measurementFields")}
            </th>
            <th className="whitespace-nowrap px-5 py-3">
              {t("catalog.addOns")}
            </th>
            <th className="whitespace-nowrap px-5 py-3">
              {t("common.status")}
            </th>
            {canManage && (
              <th className="whitespace-nowrap px-5 py-3 text-right">
                {t("common.actions")}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {garmentTypes.map((garment) => (
            <tr
              key={garment.id}
              className="border-t border-border-soft transition-colors hover:bg-surface"
            >
              <td className="whitespace-nowrap px-5 py-3 font-semibold text-ink">
                {garment.name}
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                {garment.shortcutCode === null ? (
                  <span className="text-ink-faint">-</span>
                ) : (
                  <span className="inline-flex min-w-8 justify-center rounded-md border border-border-soft bg-surface px-2 py-1 font-mono text-xs font-semibold text-primary">
                    {garment.shortcutCode}
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                <span className="inline-flex rounded-full border border-primary/15 bg-primary-tint px-2.5 py-1 text-xs font-semibold text-primary-strong">
                  {garment.section}
                </span>
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                {formatCurrency(garment.basePrice)}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {metadataFieldCounts[garment.id] ?? garment.measurementFieldIds.length}{" "}
                {(metadataFieldCounts[garment.id] ?? garment.measurementFieldIds.length) === 1
                  ? t("catalog.field")
                  : t("catalog.fields")}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {garment.addOnIds.length}{" "}
                {garment.addOnIds.length === 1
                  ? t("catalog.addOnCount")
                  : t("catalog.addOnsCount")}
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                <span
                  className={cn(
                    "inline-block rounded-full px-3 py-1 text-xs font-semibold",
                    garment.isActive
                      ? "bg-chip-mint text-chip-mint-fg"
                      : "bg-chip-info text-chip-info-fg"
                  )}
                >
                  {garment.isActive ? t("common.active") : t("common.inactive")}
                </span>
              </td>
              {canManage && (
                <td className="whitespace-nowrap px-5 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      title={t("catalog.editGarmentTypeTooltip")}
                      onClick={() => onEdit(garment)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title={
                        garment.isActive
                          ? t("catalog.deactivateGarmentType")
                          : t("catalog.activateGarmentType")
                      }
                      onClick={() => onToggleActive(garment)}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface",
                        garment.isActive
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
