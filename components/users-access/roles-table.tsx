"use client";

import { Pencil, Trash2, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/roles";
import type { AppUser } from "@/lib/profiles";
import { useLanguage } from "@/components/i18n/language-provider";

export function RolesTable({
  roles,
  users,
  canDelete,
  onEdit,
  onDelete,
}: {
  roles: Role[];
  users: AppUser[];
  canDelete: (roleId: string) => boolean;
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
}) {
  const { t } = useLanguage();
  if (roles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
        <Inbox className="mb-1 h-6 w-6 text-ink-faint" />
        <p className="text-sm text-ink-muted">{t("usersAccess.noRolesYet")}</p>
      </div>
    );
  }

  const usersAssigned = (roleId: string) =>
    users.filter((u) => u.role_id === roleId).length;

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">{t("usersAccess.roleName")}</th>
            <th className="whitespace-nowrap px-5 py-3">{t("usersAccess.type")}</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">
              {t("usersAccess.permissions")}
            </th>
            <th className="whitespace-nowrap px-5 py-3 text-right">
              {t("usersAccess.usersAssigned")}
            </th>
            <th className="whitespace-nowrap px-5 py-3 text-right">
              {t("common.actions")}
            </th>
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {roles.map((role) => {
            const assignedCount = usersAssigned(role.id);
            const deletable = role.type === "custom" && canDelete(role.id);
            return (
              <tr
                key={role.id}
                className="border-t border-border-soft transition-colors hover:bg-surface"
              >
                <td className="whitespace-nowrap px-5 py-3">
                  <div className="font-semibold text-ink">{role.name}</div>
                  {role.description && (
                    <div className="text-xs text-ink-muted">{role.description}</div>
                  )}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <span
                    className={cn(
                      "inline-block rounded-full px-3 py-1 text-xs font-semibold",
                      role.type === "system"
                        ? "bg-chip-info text-chip-info-fg"
                        : "bg-primary-tint text-primary"
                    )}
                  >
                    {role.type === "system" ? t("usersAccess.system") : t("usersAccess.custom")}
                  </span>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right text-ink-muted">
                  {role.permissions.length}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right text-ink-muted">
                  {assignedCount}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      title={t("usersAccess.editRoleTooltip")}
                      onClick={() => onEdit(role)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {role.type === "custom" && (
                      <button
                        type="button"
                        title={
                          deletable
                            ? t("usersAccess.deleteRoleTooltip")
                            : `Cannot delete — ${assignedCount} user${assignedCount === 1 ? "" : "s"} assigned`
                        }
                        disabled={!deletable}
                        onClick={() => onDelete(role)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-chip-red-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-ink-muted"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
