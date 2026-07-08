"use client";

import type { ReactNode } from "react";
import type { Permission } from "@/lib/permissions";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { AccessDenied } from "@/components/auth/access-denied";

// Page-level guard. Wrap a page's returned JSX with this rather than
// redirecting: per the brief, missing access must show a visible Access
// Denied state, not a silent redirect and not a crash.
//
// Pass exactly one of `permission` (single check), `anyOf` (at least one
// required), or `allOf` (all required).
export function RequirePermission({
  permission,
  anyOf,
  allOf,
  children,
}: {
  permission?: Permission;
  anyOf?: Permission[];
  allOf?: Permission[];
  children: ReactNode;
}) {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = useCurrentUser();

  let allowed = true;
  if (permission) allowed = allowed && hasPermission(permission);
  if (anyOf) allowed = allowed && hasAnyPermission(anyOf);
  if (allOf) allowed = allowed && hasAllPermissions(allOf);

  if (!allowed) return <AccessDenied />;
  return <>{children}</>;
}
