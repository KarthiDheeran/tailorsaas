"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Users2,
  BarChart3,
  Shirt,
  Store,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/catalog", label: "Catalog", icon: Layers },
  { href: "/staff", label: "Staff", icon: Users2 },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-[250px] flex-col bg-white px-4 py-6 print:hidden">
      <div className="mb-8 flex items-center gap-2 px-2">
        <Shirt className="h-6 w-6 text-primary" />
        <div>
          <div className="text-[18px] font-bold leading-tight tracking-tight text-ink">
            TailorSaaS
          </div>
          <div className="text-[11px] leading-tight text-ink-faint">
            Tailoring. Simplified.
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg border-l-4 px-4 py-2.5 text-sm transition-colors",
                isActive
                  ? "border-primary bg-primary-tint font-semibold text-primary"
                  : "border-transparent font-medium text-ink-muted hover:bg-surface hover:text-ink"
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-3 rounded-lg border border-border-soft bg-surface px-3 py-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary">
          <Store className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">
            Shop Account
          </div>
          <div className="truncate text-[11px] text-ink-faint">Owner</div>
        </div>
      </div>
    </aside>
  );
}
