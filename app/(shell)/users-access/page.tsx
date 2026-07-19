"use client";

// TODO: Users & Access lives as a top-level sidebar item for MVP testing
// convenience (there's no Settings module yet — see CLAUDE.md). Once a real
// Settings module exists, move this page under it (e.g.
// app/(shell)/settings/users-access) and update the sidebar entry in
// components/layout/sidebar.tsx to match.

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import type { AppUser } from "@/lib/profiles";
import type { Role, RoleInput } from "@/lib/roles";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import {
  UsersAccessTabs,
  type UsersAccessTab,
} from "@/components/users-access/users-access-tabs";
import { UsersTable } from "@/components/users-access/users-table";
import { UserEditDrawer } from "@/components/users-access/user-edit-drawer";
import { AddUserDrawer } from "@/components/users-access/add-user-drawer";
import { RolesTable } from "@/components/users-access/roles-table";
import { RoleEditDrawer } from "@/components/users-access/role-edit-drawer";
import { useLanguage } from "@/components/i18n/language-provider";

function UsersAccessPageContent() {
  const {
    users,
    roles,
    createUser,
    updateUserProfile,
    resetUserPassword,
    createRole,
    updateRole,
    deleteRole,
  } = useCurrentUser();
  const { t } = useLanguage();
  const [tab, setTab] = useState<UsersAccessTab>("users");

  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);

  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isAddingRole, setIsAddingRole] = useState(false);
  const roleDrawerOpen = isAddingRole || editingRole !== null;

  function handleUserSaved(patch: {
    id: string;
    fullName: string;
    phone?: string;
    roleId: string;
    active: boolean;
    staffId?: string;
  }) {
    return updateUserProfile(patch);
  }

  function handleRoleSaved(input: RoleInput) {
    // Drawer awaits this and closes itself (calling onCancel) only on
    // success — same pattern as the Catalog/Staff drawers since Phase 5D
    // gave Roles real server-side validation/errors to surface.
    return editingRole ? updateRole(editingRole.id, input) : createRole(input);
  }

  // Client-side quick feedback only (disables the delete button) — a role
  // is deletable if it's custom and no profile is currently assigned to it.
  // deleteRoleAction re-checks this authoritatively server-side with its
  // own fresh query, never trusting this copy.
  const canDelete = (roleId: string) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role || role.type !== "custom") return false;
    return !users.some((u) => u.role_id === roleId);
  };

  async function handleDeleteRole(role: Role) {
    if (!canDelete(role.id)) return;
    if (!confirm(`Delete role "${role.name}"? This can't be undone.`)) return;
    const result = await deleteRole(role.id);
    if (!result.success) {
      window.alert(result.error);
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <Link
        href="/settings"
        className="mb-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-soft bg-white px-3 text-sm font-semibold text-ink-muted shadow-soft transition-colors hover:border-primary hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">{t("usersAccess.title")}</h1>
          <p className="text-sm text-ink-muted">
            {t("usersAccess.subtitle")}
          </p>
        </div>
        {tab === "roles" ? (
          <button
            type="button"
            onClick={() => setIsAddingRole(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" />
            {t("usersAccess.addRole")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsAddingUser(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" />
            Add User
          </button>
        )}
      </div>

      <div className="mb-6 rounded-lg border border-border-soft bg-surface px-4 py-3 text-sm text-ink-muted">
        {t("usersAccess.disclaimer")}
      </div>

      <UsersAccessTabs active={tab} onChange={setTab} />

      {tab === "users" ? (
        <UsersTable users={users} roles={roles} onEdit={setEditingUser} />
      ) : (
        <RolesTable
          roles={roles}
          users={users}
          canDelete={canDelete}
          onEdit={setEditingRole}
          onDelete={handleDeleteRole}
        />
      )}

      {editingUser && (
        <UserEditDrawer
          key={editingUser.id}
          user={editingUser}
          roles={roles}
          users={users}
          onCancel={() => setEditingUser(null)}
          onSaved={handleUserSaved}
          onResetPassword={resetUserPassword}
        />
      )}

      {isAddingUser && (
        <AddUserDrawer
          roles={roles}
          onCancel={() => setIsAddingUser(false)}
          onCreate={createUser}
        />
      )}

      {roleDrawerOpen && (
        <RoleEditDrawer
          key={editingRole?.id ?? "new"}
          role={editingRole}
          onCancel={() => {
            setEditingRole(null);
            setIsAddingRole(false);
          }}
          onSaved={handleRoleSaved}
        />
      )}
    </div>
  );
}

export default function UsersAccessPage() {
  return (
    <RequirePermission anyOf={["settings.manageUsers", "settings.manageRoles"]}>
      <UsersAccessPageContent />
    </RequirePermission>
  );
}
