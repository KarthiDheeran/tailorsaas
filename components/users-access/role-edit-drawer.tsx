"use client";

import { useState } from "react";
import { RotateCcw, X } from "lucide-react";
import {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  withPermissionDependencies,
  type Permission,
} from "@/lib/permissions";
import {
  DEFAULT_MANAGER_PERMISSIONS,
  DEFAULT_STAFF_PERMISSIONS,
  SYSTEM_ROLE_IDS,
  type Role,
  type RoleInput,
} from "@/lib/roles";
import { useLanguage } from "@/components/i18n/language-provider";

const inputClass =
  "h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint disabled:cursor-not-allowed disabled:bg-surface disabled:text-ink-faint";

// null role = create-new-custom-role mode. Editing an existing role branches
// on its type: Admin is fully locked (always every permission — see
// lib/roles.ts's updateRole), Manager/Staff keep name/description fixed but
// their permission checklist stays editable with a Reset to default, and
// custom roles are fully editable (name/description/permissions).
export function RoleEditDrawer({
  role,
  onCancel,
  onSaved,
}: {
  role: Role | null;
  onCancel: () => void;
  onSaved: (input: RoleInput) => void;
}) {
  const isCreate = role === null;
  const isAdmin = role?.id === SYSTEM_ROLE_IDS.ADMIN;
  const isSystem = role?.type === "system";
  const nameLocked = isSystem; // system role names/descriptions never change
  const permissionsLocked = isAdmin; // Admin always has every permission

  const { t } = useLanguage();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<Permission[]>(
    isAdmin ? [...ALL_PERMISSIONS] : role?.permissions ?? []
  );
  const [error, setError] = useState<string | null>(null);

  function togglePermission(permission: Permission) {
    if (permissionsLocked) return;
    const checked = !permissions.includes(permission);
    setPermissions((prev) => withPermissionDependencies(prev, permission, checked));
  }

  // Local-only, like the rest of this drawer — takes effect on Save, not
  // immediately, same as every other edit here (Cancel still discards it).
  function handleResetToDefault() {
    if (role?.id === SYSTEM_ROLE_IDS.MANAGER) {
      setPermissions([...DEFAULT_MANAGER_PERMISSIONS]);
    } else if (role?.id === SYSTEM_ROLE_IDS.STAFF) {
      setPermissions([...DEFAULT_STAFF_PERMISSIONS]);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!nameLocked && !trimmedName) {
      setError(t("validation.nameRequired"));
      return;
    }
    onSaved({
      name: nameLocked ? role!.name : trimmedName,
      description: nameLocked ? role?.description : description.trim() || undefined,
      permissions: isAdmin ? [...ALL_PERMISSIONS] : permissions,
    });
  }

  return (
    <>
      <div
        onClick={onCancel}
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto bg-white shadow-soft sm:w-[560px]">
        <div className="flex items-start justify-between border-b border-border-soft px-6 py-5">
          <div>
            <p className="text-[17px] font-semibold text-ink">
              {isCreate ? t("usersAccess.addRole") : `${t("usersAccess.editRole")} — ${role.name}`}
            </p>
            <p className="text-sm text-ink-muted">
              {isAdmin
                ? "Admin always has every permission and can't be edited."
                : isSystem
                  ? "System role — name is fixed, but permissions can be customized."
                  : "Custom role — name, description, and permissions are all editable."}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("common.close")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col justify-between">
          <div className="space-y-5 px-6 py-5">
            {error && (
              <div className="rounded-lg bg-chip-red px-4 py-2.5 text-sm font-medium text-chip-red-fg">
                {error}
              </div>
            )}

            <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("usersAccess.roleName")}
                  </span>
                  <input
                    required
                    disabled={nameLocked}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Cutter Lead"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("usersAccess.description")} <span className="font-normal">({t("common.optional")})</span>
                  </span>
                  <input
                    disabled={nameLocked}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What this role is for"
                    className={inputClass}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-[17px] font-semibold text-ink">{t("usersAccess.permissions")}</h3>
                {!isCreate && isSystem && !isAdmin && (
                  <button
                    type="button"
                    onClick={handleResetToDefault}
                    className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-white px-3.5 text-xs font-semibold text-ink transition-colors hover:bg-surface"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("usersAccess.resetToDefault")}
                  </button>
                )}
              </div>
              {permissionsLocked && (
                <p className="mb-4 text-xs text-ink-faint">
                  Locked — Admin always keeps every permission.
                </p>
              )}
              <div className="space-y-5">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.title}>
                    <p className="mb-2 text-[13px] font-semibold text-ink-muted">
                      {group.title}
                    </p>
                    <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
                      {group.permissions.map((p) => (
                        <label
                          key={p.key}
                          className={`flex items-center gap-2 text-sm ${
                            permissionsLocked ? "text-ink-faint" : "text-ink"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={permissions.includes(p.key)}
                            disabled={permissionsLocked}
                            onChange={() => togglePermission(p.key)}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary-tint disabled:cursor-not-allowed"
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-border-soft px-6 py-4">
            <button
              type="submit"
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
            >
              {isCreate ? t("usersAccess.createRoleBtn") : t("common.saveChanges")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
