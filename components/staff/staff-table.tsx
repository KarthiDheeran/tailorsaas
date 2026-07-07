import Link from "next/link";
import { Eye, Pencil, ClipboardPlus, UserX, Inbox } from "lucide-react";
import { StaffStatusBadge } from "@/components/staff/status-badge";
import type { StaffListRow } from "@/lib/staff";

export function StaffTable({
  rows,
  onDeactivate,
}: {
  rows: StaffListRow[];
  onDeactivate: (staffId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
        <Inbox className="mb-1 h-6 w-6 text-ink-faint" />
        <p className="text-sm text-ink-muted">
          No staff match these filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">Staff Name</th>
            <th className="whitespace-nowrap px-5 py-3">Role</th>
            <th className="whitespace-nowrap px-5 py-3">Phone</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">
              Active Orders
            </th>
            <th className="whitespace-nowrap px-5 py-3 text-right">
              Completed This Month
            </th>
            <th className="whitespace-nowrap px-5 py-3 text-right">
              Pending Work
            </th>
            <th className="whitespace-nowrap px-5 py-3">Status</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {rows.map(({ staff, activeOrders, completedThisMonth, pendingWork }) => (
            <tr
              key={staff.id}
              className="border-t border-border-soft transition-colors hover:bg-surface"
            >
              <td className="whitespace-nowrap px-5 py-3">
                <div className="font-semibold text-ink">{staff.name}</div>
                <div className="text-xs text-ink-muted">{staff.staffNumber}</div>
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {staff.role}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {staff.phone}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                {activeOrders}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                {completedThisMonth}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                {pendingWork}
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                <StaffStatusBadge status={staff.status} />
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                <div className="flex items-center justify-end gap-1.5">
                  <Link
                    href={`/staff/${staff.id}`}
                    title="View"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    href={`/staff/assign?staffId=${staff.id}`}
                    title="Assign Work"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                  >
                    <ClipboardPlus className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    href={`/staff/${staff.id}/edit`}
                    title="Edit"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                  {staff.status !== "Inactive" && (
                    <button
                      type="button"
                      title="Deactivate"
                      onClick={() => onDeactivate(staff.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-chip-red-fg"
                    >
                      <UserX className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
