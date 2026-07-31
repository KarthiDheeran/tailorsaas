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
import { usePathname } from "next/navigation";
import type { Permission } from "@/lib/permissions";
import type { GarmentSection } from "@/lib/catalog";
import {
  hasAllPermissions as checkAllPermissions,
  hasAnyPermission as checkAnyPermission,
  hasPermission as checkPermission,
} from "@/lib/permissions";
import { getAppUsers, type AppUser } from "@/lib/profiles";
import { getRoleById, getRoles, type Role, type RoleInput } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import {
  createRoleAction,
  createUserAction,
  deleteRoleAction,
  resetUserPasswordAction,
  updateRoleAction,
  updateUserProfileAction,
} from "@/app/(shell)/users-access/actions";
import { updateDisplayThemeAction } from "@/app/(shell)/settings/actions";
import type { CreateUserInput } from "@/components/users-access/add-user-drawer";
import {
  DEFAULT_THEME,
  isDisplayTheme,
  THEME_COOKIE_NAME,
  type DisplayTheme,
} from "@/lib/theme";

type ActionResult = { success: boolean; error?: string };

interface CurrentUserContextValue {
  currentUser: AppUser | undefined;
  currentUserId: string | undefined;
  currentRole: Role | undefined;
  displayTheme: DisplayTheme;
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
    shopId?: string;
    allowedOrderSections: GarmentSection[];
  }) => Promise<ActionResult>;
  resetUserPassword: (input: { userId: string; tempPassword: string }) => Promise<ActionResult>;
  createRole: (input: RoleInput) => Promise<ActionResult>;
  updateRole: (id: string, input: RoleInput) => Promise<ActionResult>;
  deleteRole: (id: string) => Promise<ActionResult>;
  setDisplayTheme: (theme: DisplayTheme) => Promise<ActionResult>;
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
  const [displayTheme, setDisplayThemeState] = useState<DisplayTheme>(DEFAULT_THEME);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const pathname = usePathname();
  const needsUsersAccessData = pathname?.startsWith("/users-access") ?? false;

  // Tracks the real Supabase auth session — fires once on mount with the
  // current session, then again on every sign-in/sign-out/token refresh.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        setAuthUserId(data.user?.id ?? null);
      })
      .catch((error) => {
        console.error("Failed to load authenticated user.", error);
        setAuthUserId(null);
      })
      .finally(() => {
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
        setDisplayThemeState(DEFAULT_THEME);
        setProfileResolved(true);
        return;
      }
      setProfileResolved(false);
      const supabase = createClient();
      try {
        type ProfileWithRole = AppUser & { role?: Role | Role[] | null };
        let profileRow: ProfileWithRole | null = null;
        const joined = await supabase
          .from("profiles")
            .select(
            "id, full_name, phone, role_id, active, must_change_password, staff_id, tenant_id, shop_id, allowed_order_sections, preferred_theme, role:roles(id,name,description,type,permissions)"
          )
          .eq("id", authUserId)
          .maybeSingle();
        let error = joined.error;
        profileRow = joined.data as ProfileWithRole | null;
        if (error) {
          const fallback = await supabase
            .from("profiles")
            .select("id, full_name, phone, role_id, active, must_change_password, staff_id, tenant_id, shop_id, allowed_order_sections")
            .eq("id", authUserId)
            .maybeSingle();
          profileRow = fallback.data as ProfileWithRole | null;
          error = fallback.error;
        }
        if (error) throw error;
        if (cancelled) return;

        setProfile(profileRow ?? undefined);
        setDisplayThemeState(
          isDisplayTheme(profileRow?.preferred_theme)
            ? profileRow.preferred_theme
            : DEFAULT_THEME
        );
        const joinedRole = Array.isArray(profileRow?.role) ? profileRow.role[0] : profileRow?.role;
        const roleId = profileRow?.role_id;
        const resolvedRole = joinedRole
          ? (joinedRole as Role)
          : roleId
            ? await getRoleById(supabase, roleId)
            : undefined;
        if (!cancelled) setRole(resolvedRole);
      } catch (error) {
        console.error("Failed to load workspace profile.", error);
        if (!cancelled) {
          setProfile(undefined);
          setRole(undefined);
        }
      } finally {
        if (!cancelled) {
          setProfileResolved(true);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [authUserId, refreshTick]);

  useEffect(() => {
    document.documentElement.dataset.theme = displayTheme;
    document.cookie = `${THEME_COOKIE_NAME}=${displayTheme}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  }, [displayTheme]);

  // Full roles list — Users & Access Roles tab, and the Users tab's role
  // dropdown/name lookup.
  useEffect(() => {
    if (!authUserId || !needsUsersAccessData) {
      setRoles([]);
      return;
    }

    let cancelled = false;
    getRoles(createClient())
      .then((r) => {
        if (!cancelled) setRoles(r);
      })
      .catch(() => {
        if (!cancelled) setRoles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId, needsUsersAccessData, refreshTick]);

  // Full users list — Users & Access Users tab, and the last-Admin check's
  // client-side immediate feedback (the server action re-checks this
  // authoritatively with its own fresh fetch, never trusting this copy).
  useEffect(() => {
    const canLoadUsers =
      needsUsersAccessData &&
      !!authUserId &&
      !!profile?.active &&
      !!role?.permissions.includes("settings.manageUsers");

    if (!canLoadUsers) {
      setUsers([]);
      return;
    }

    let cancelled = false;
    getAppUsers(createClient())
      .then((u) => {
        if (!cancelled) setUsers(u);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId, needsUsersAccessData, profile?.active, role?.permissions, refreshTick]);

  const createRole = useCallback(async (input: RoleInput): Promise<ActionResult> => {
    const result = await createRoleAction(input);
    if (result.success) setRefreshTick((t) => t + 1);
    return result;
  }, []);

  const updateRole = useCallback(
    async (id: string, input: RoleInput): Promise<ActionResult> => {
      const result = await updateRoleAction(id, input);
      if (result.success) setRefreshTick((t) => t + 1);
      return result;
    },
    []
  );

  const deleteRole = useCallback(async (id: string): Promise<ActionResult> => {
    const result = await deleteRoleAction(id);
    if (result.success) setRefreshTick((t) => t + 1);
    return result;
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
      shopId?: string;
      allowedOrderSections: GarmentSection[];
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

  const setDisplayTheme = useCallback(
    async (theme: DisplayTheme): Promise<ActionResult> => {
      if (!isDisplayTheme(theme)) return { success: false, error: "Invalid theme." };
      const previous = displayTheme;
      setDisplayThemeState(theme);

      const result = await updateDisplayThemeAction(theme);
      if (!result.success) {
        setDisplayThemeState(previous);
        return { success: false, error: result.error };
      }

      setProfile((current) =>
        current ? { ...current, preferred_theme: theme } : current
      );
      return { success: true };
    },
    [displayTheme]
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
      displayTheme,
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
      setDisplayTheme,
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
    displayTheme,
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
    setDisplayTheme,
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
