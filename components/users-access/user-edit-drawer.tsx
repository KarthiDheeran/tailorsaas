"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { checkCanSaveUserGivenUsers, type AppUser } from "@/lib/profiles";
import type { Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import { Select } from "@/components/ui/select";
import { useLanguage } from "@/components/i18n/language-provider";

const inputClass =
  "h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

// Users are assigned a role, not permissions directly — see lib/roles.ts.
// This drawer edits identity/role/status/staff-link and (Phase 4) can reset
// the user's password; the permission checklist itself lives on the role,
// in role-edit-drawer.tsx. Editing email is intentionally not supported
// here — it lives on auth.users, not profiles, and isn't simple/safe to
// change within this phase's scope.
export function UserEditDrawer({
  user,
  roles,
  users,
  onCancel,
  onSaved,
  onResetPassword,
}: {
  user: AppUser;
  roles: Role[];
  users: AppUser[];
  onCancel: () => void;
  onSaved: (patch: {
    id: string;
    fullName: string;
    phone?: string;
    roleId: string;
    active: boolean;
    staffId?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  onResetPassword: (input: {
    userId: string;
    tempPassword: string;
  }) => Promise<{ success: boolean; error?: string }>;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(user.full_name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [roleId, setRoleId] = useState(user.role_id);
  const [active, setActive] = useState(user.active);
  const [staffId, setStaffId] = useState(user.staff_id ?? "");
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const deactivateBlockedReason = checkCanSaveUserGivenUsers(user.id, roleId, false, users);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("staff")
      .select("id, name")
      .then(({ data }) => {
        if (!cancelled) setStaffOptions(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError(t("validation.nameRequired"));
      return;
    }
    const blockReason = checkCanSaveUserGivenUsers(user.id, roleId, active, users);
    if (blockReason) {
      setError(blockReason);
      return;
    }
    setSubmitting(true);
    const result = await onSaved({
      id: user.id,
      fullName: name.trim(),
      phone: phone.trim() || undefined,
      roleId,
      active,
      staffId: staffId || undefined,
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Could not save changes.");
      return;
    }
    onCancel();
  }

  async function handleResetPassword() {
    setResetError(null);
    if (tempPassword.length < 8) {
      setResetError("Temporary password must be at least 8 characters.");
      return;
    }
    setResetSubmitting(true);
    const result = await onResetPassword({ userId: user.id, tempPassword });
    setResetSubmitting(false);
    if (!result.success) {
      setResetError(result.error ?? "Could not reset password.");
      return;
    }
    setResetDone(true);
    setTempPassword("");
  }

  return (
    <>
      <div
        onClick={onCancel}
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto bg-white shadow-soft sm:w-[460px]">
        <div className="flex items-start justify-between border-b border-border-soft px-6 py-5">
          <div>
            <p className="text-[17px] font-semibold text-ink">{t("usersAccess.editUser")}</p>
            <p className="text-sm text-ink-muted">{user.full_name}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("common.close")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 px-6 py-5">
          {error && (
            <div className="rounded-lg bg-chip-red px-4 py-2.5 text-sm font-medium text-chip-red-fg">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-ink-muted">{t("common.name")}</span>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-ink-muted">{t("common.phone")}</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t("common.optional")}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-ink-muted">
                  {t("usersAccess.assignedRole")}
                </span>
                <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.type === "custom" ? " (Custom)" : ""}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-ink-muted">{t("common.status")}</span>
                <Select
                  value={active ? "Active" : "Inactive"}
                  onChange={(e) => setActive(e.target.value === "Active")}
                >
                  <option value="Active">{t("common.active")}</option>
                  <option
                    value="Inactive"
                    disabled={deactivateBlockedReason !== null}
                  >
                    {t("common.inactive")}
                  </option>
                </Select>
                {deactivateBlockedReason && (
                  <p className="text-xs text-ink-faint">{deactivateBlockedReason}</p>
                )}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-ink-muted">
                  Linked staff record <span className="font-normal">({t("common.optional")})</span>
                </span>
                <Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                  <option value="">None</option>
                  {staffOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-semibold text-ink">Password</h3>
                <p className="text-xs text-ink-muted">
                  Set a new temporary password — the user will be required to change it on their
                  next login.
                </p>
              </div>
              {!resetOpen && (
                <button
                  type="button"
                  onClick={() => {
                    setResetOpen(true);
                    setResetDone(false);
                  }}
                  className="whitespace-nowrap rounded-lg border border-border bg-white px-3.5 py-2 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted"
                >
                  Reset Password
                </button>
              )}
            </div>
            {resetOpen && (
              <div className="mt-4 space-y-3">
                {resetDone ? (
                  <div className="rounded-lg bg-chip-mint px-3.5 py-2.5 text-sm font-medium text-chip-mint-fg">
                    Password reset — share the new temporary password with the user directly.
                  </div>
                ) : (
                  <>
                    {resetError && (
                      <div className="rounded-lg bg-chip-red px-3.5 py-2.5 text-xs font-medium text-chip-red-fg">
                        {resetError}
                      </div>
                    )}
                    <input
                      value={tempPassword}
                      onChange={(e) => setTempPassword(e.target.value)}
                      placeholder="New temporary password (min 8 characters)"
                      className={inputClass}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={resetSubmitting}
                        onClick={handleResetPassword}
                        className="rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:opacity-60"
                      >
                        {resetSubmitting ? "Saving…" : "Set new password"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setResetOpen(false);
                          setResetError(null);
                          setTempPassword("");
                        }}
                        className="rounded-lg border border-border bg-white px-3.5 py-2 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border-soft px-6 py-4">
          <button
            type="button"
            disabled={submitting}
            onClick={handleSave}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {submitting ? "Saving…" : t("common.save")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </>
  );
}
