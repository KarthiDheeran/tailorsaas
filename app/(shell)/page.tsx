"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AccessDenied } from "@/components/auth/access-denied";
import { useCurrentUser } from "@/components/auth/current-user-provider";

export default function Home() {
  const router = useRouter();
  const { hasPermission, hasAnyPermission } = useCurrentUser();

  const landingPath =
    (hasPermission("dashboard.view") && "/dashboard") ||
    (hasPermission("calendar.view") && "/calendar") ||
    (hasPermission("orders.view") && "/orders") ||
    (hasPermission("staff.view") && "/staff") ||
    (hasPermission("customers.view") && "/customers") ||
    (hasAnyPermission(["orders.viewPayments", "expenses.view"]) && "/payments") ||
    (hasPermission("inventory.view") && "/inventory") ||
    (hasPermission("reports.view") && "/reports") ||
    (hasPermission("settings.view") && "/settings") ||
    (hasPermission("catalog.view") && "/catalog") ||
    null;

  useEffect(() => {
    if (landingPath) {
      router.replace(landingPath);
    }
  }, [landingPath, router]);

  if (!landingPath) return <AccessDenied />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}
