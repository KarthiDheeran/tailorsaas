import { Pencil, Power, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CatalogAddOn } from "@/lib/catalog";

export function AddOnTable({
  addOns,
  onEdit,
  onToggleActive,
}: {
  addOns: CatalogAddOn[];
  onEdit: (addOn: CatalogAddOn) => void;
  onToggleActive: (addOn: CatalogAddOn) => void;
}) {
  if (addOns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
        <Inbox className="mb-1 h-6 w-6 text-ink-faint" />
        <p className="text-sm text-ink-muted">No add-ons yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">Add-on Name</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">
              Default Price
            </th>
            <th className="whitespace-nowrap px-5 py-3">Status</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {addOns.map((addOn) => (
            <tr
              key={addOn.id}
              className="border-t border-border-soft transition-colors hover:bg-surface"
            >
              <td className="whitespace-nowrap px-5 py-3 font-semibold text-ink">
                {addOn.name}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                ₹{addOn.defaultPrice.toLocaleString("en-IN")}
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
                  {addOn.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    title="Edit add-on"
                    onClick={() => onEdit(addOn)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title={
                      addOn.isActive ? "Deactivate add-on" : "Activate add-on"
                    }
                    onClick={() => onToggleActive(addOn)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface",
                      addOn.isActive
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
