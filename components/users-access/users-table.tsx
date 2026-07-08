"use client";

import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppUser } from "@/lib/profiles";
import type { Role } from "@/lib/roles";
import { useLanguage } from "@/components/i18n/language-provider";

export function UsersTable({
  users,
  roles,
  onEdit,
}: {
  users: AppUser[];
  roles: Role[];
  onEdit: (user: AppUser) => void;
}) {
  const { t } = useLanguage();
  const roleName = (roleId: string) =>
    roles.find((r) => r.id === roleId)?.name ?? "—";

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">{t("common.name")}</th>
            <th className="whitespace-nowrap px-5 py-3">{t("common.phone")}</th>
            <th className="whitespace-nowrap px-5 py-3">{t("usersAccess.assignedRole")}</th>
            <th className="whitespace-nowrap px-5 py-3">{t("common.active")}</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">
              {t("common.actions")}
            </th>
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {users.map((user) => (
            <tr
              key={user.id}
              className="border-t border-border-soft transition-colors hover:bg-surface"
            >
              <td className="whitespace-nowrap px-5 py-3 font-semibold text-ink">
                {user.full_name}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {user.phone ?? "—"}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {roleName(user.role_id)}
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                <span
                  className={cn(
                    "inline-block rounded-full px-3 py-1 text-xs font-semibold",
                    user.active
                      ? "bg-chip-mint text-chip-mint-fg"
                      : "bg-chip-info text-chip-info-fg"
                  )}
                >
                  {user.active ? t("common.active") : t("common.inactive")}
                </span>
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    title={t("usersAccess.editUserTooltip")}
                    onClick={() => onEdit(user)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" />
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
