import { Pencil, Power, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CatalogGarmentType } from "@/lib/catalog";

export function CatalogTable({
  garmentTypes,
  onEdit,
  onToggleActive,
}: {
  garmentTypes: CatalogGarmentType[];
  onEdit: (garment: CatalogGarmentType) => void;
  onToggleActive: (garment: CatalogGarmentType) => void;
}) {
  if (garmentTypes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
        <Inbox className="mb-1 h-6 w-6 text-ink-faint" />
        <p className="text-sm text-ink-muted">No garment types yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">Garment Type</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">
              Base Price
            </th>
            <th className="whitespace-nowrap px-5 py-3">
              Measurement Fields
            </th>
            <th className="whitespace-nowrap px-5 py-3">Add-ons</th>
            <th className="whitespace-nowrap px-5 py-3">Status</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">
              Actions
            </th>
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
              <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                ₹{garment.basePrice.toLocaleString("en-IN")}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {garment.measurementFieldIds.length} field
                {garment.measurementFieldIds.length === 1 ? "" : "s"}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {garment.addOnIds.length} add-on
                {garment.addOnIds.length === 1 ? "" : "s"}
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
                  {garment.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    title="Edit garment type"
                    onClick={() => onEdit(garment)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title={
                      garment.isActive
                        ? "Deactivate garment type"
                        : "Activate garment type"
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
