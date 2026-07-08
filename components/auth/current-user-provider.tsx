"use client";

// ---------------------------------------------------------------------------
// Phase 4: `users` (the Users & Access "Users" tab) is now real too — reads
// go straight to Supabase (lib/profiles.ts), writes go through the three
// Server Actions in app/(shell)/users-access/actions.ts (create/update/
// reset-password), since creating a user and resetting someone else's
// password need the service-role key, and editing role/active needs the
// last-Admin guard enforced somewhere a client can't bypass. `roles` stayed
// real since Phase 3. Nothing here is mock anymore except business data
// (Orders/Customers/Catalog/Staff HR) — that's Phase 6.
// ---------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Permission } from "@/lib/permissions";
import {
  hasAllPermissions as checkAllPermissions,
  hasAnyPermission as checkAnyPermission,
  hasPermission as checkPermission,
} from "@/lib/permissions";
import { getAppUsers, type AppUser } from "@/lib/profiles";
import {
  createRole as createRoleData,
  deleteRole as deleteRoleData,
  getRoleById,
  getRoles,
  updateRole as updateRoleData,
  type Role,
  type RoleInput,
} from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import {
  createUserAction,
  resetUserPasswordAction,
  updateUserProfileAction,
} from "@/app/(shell)/users-access/actions";
import type { CreateUserInput } from "@/components/users-access/add-user-drawer";

type ActionResult = { success: boolean; error?: string };

interface CurrentUserContextValue {
  currentUser: AppUser | undefined;
  currentUserId: string | undefined;
  currentRole: Role | undefined;
  effectivePermissions: Permission[];
  // True until the first session + profile/role fetch resolves — consumers
  // (app-shell.tsx) use this to avoid a flash of "access denied" before real
  // permissions have loaded, which a synchronous mock-array read never had
  // to account for.
  isLoading: boolean;
  users: AppUser[];
  roles: Role[];
  createUser: (input: CreateUserInput) => Promise<ActionResult>;
  updateUserProfile: (input: {
    id: string;
    fullName: string;
    phone?: string;
    roleId: string;
    active: boolean;
    staffId?: string;
  }) => Promise<ActionResult>;
  resetUserPassword: (input: { userId: string; tempPassword: string }) => Promise<ActionResult>;
  createRole: (input: RoleInput) => void;
  updateRole: (id: string, input: RoleInput) => void;
  deleteRole: (id: string) => void;
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  hasAllPermissions: (permissions: Permission[]) => boolean;
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  // Bumped after any role/user write so consumers re-fetch — every mutation
  // here is a real Supabase write now, so this just triggers the effects
  // below to re-run, not an in-place mock-array mutation.
  const [refreshTick, setRefreshTick] = useState(0);

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [profile, setProfile] = useState<AppUser | undefined>(undefined);
  const [role, setRole] = useState<Role | undefined>(undefined);
  const [profileResolved, setProfileResolved] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);

  // Tracks the real Supabase auth session — fires once on mount with the
  // current session, then again on every sign-in/sign-out/token refresh.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setAuthUserId(data.user?.id ?? null);
      setAuthResolved(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUserId(session?.user?.id ?? null);
      setAuthResolved(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetches the logged-in user's own profiles row + their role. Re-runs
  // whenever the auth user changes, or after a write (refreshTick) so e.g.
  // editing your own role's permissions takes effect without a full reload.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!authUserId) {
        setProfile(undefined);
        setRole(undefined);
        setProfileResolved(true);
        return;
      }
      setProfileResolved(false);
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, phone, role_id, active, must_change_password, staff_id")
        .eq("id", authUserId)
        .maybeSingle();
      if (cancelled) return;

      setProfile((data as AppUser) ?? undefined);
      const roleId = data?.role_id;
      const resolvedRole = roleId ? await getRoleById(roleId) : undefined;
      if (!cancelled) {
        setRole(resolvedRole);
        setProfileResolved(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [authUserId, refreshTick]);

  // Full roles list — Users & Access Roles tab, and the Users tab's role
  // dropdown/name lookup.
  useEffect(() => {
    let cancelled = false;
    getRoles().then((r) => {
      if (!cancelled) setRoles(r);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  // Full users list — Users & Access Users tab, and the last-Admin check's
  // client-side immediate feedback (the server action re-checks this
  // authoritatively with its own fresh fetch, never trusting this copy).
  useEffect(() => {
    let cancelled = false;
    getAppUsers(createClient()).then((u) => {
      if (!cancelled) setUsers(u);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const createRole = useCallback((input: RoleInput) => {
    createRoleData(input).then(() => setRefreshTick((t) => t + 1));
  }, []);

  const updateRole = useCallback((id: string, input: RoleInput) => {
    updateRoleData(id, input).then(() => setRefreshTick((t) => t + 1));
  }, []);

  const deleteRole = useCallback((id: string) => {
    deleteRoleData(id).then(() => setRefreshTick((t) => t + 1));
  }, []);

  const createUser = useCallback(async (input: CreateUserInput): Promise<ActionResult> => {
    const result = await createUserAction(input);
    if (result.success) setRefreshTick((t) => t + 1);
    return result;
  }, []);

  const updateUserProfile = useCallback(
    async (input: {
      id: string;
      fullName: string;
      phone?: string;
      roleId: string;
      active: boolean;
      staffId?: string;
    }): Promise<ActionResult> => {
      const result = await updateUserProfileAction(input);
      if (result.success) setRefreshTick((t) => t + 1);
      return result;
    },
    []
  );

  const resetUserPassword = useCallback(
    async (input: { userId: string; tempPassword: string }): Promise<ActionResult> => {
      const result = await resetUserPasswordAction(input);
      if (result.success) setRefreshTick((t) => t + 1);
      return result;
    },
    []
  );

  const isLoading = !authResolved || !profileResolved;

  const value = useMemo<CurrentUserContextValue>(() => {
    void refreshTick; // force recompute after role/user writes
    // A deactivated profile gets zero permissions, even though its own
    // Supabase session may still technically be valid — this is what
    // actually makes "Set active/inactive" (Phase 4) a real control, not
    // just a cosmetic flag (Phase 3's fetch never checked this).
    const effectivePermissions = profile?.active ? role?.permissions ?? [] : [];
    return {
      currentUser: profile,
      currentUserId: authUserId ?? undefined,
      currentRole: role,
      effectivePermissions,
      isLoading,
      users,
      roles,
      createUser,
      updateUserProfile,
      resetUserPassword,
      createRole,
      updateRole,
      deleteRole,
      hasPermission: (permission) => checkPermission(effectivePermissions, permission),
      hasAnyPermission: (permissions) =>
        checkAnyPermission(effectivePermissions, permissions),
      hasAllPermissions: (permissions) =>
        checkAllPermissions(effectivePermissions, permissions),
    };
  }, [
    profile,
    authUserId,
    role,
    isLoading,
    users,
    roles,
    refreshTick,
    createUser,
    updateUserProfile,
    resetUserPassword,
    createRole,
    updateRole,
    deleteRole,
  ]);

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) {
    throw new Error("useCurrentUser must be used within a CurrentUserProvider");
  }
  return ctx;
}
