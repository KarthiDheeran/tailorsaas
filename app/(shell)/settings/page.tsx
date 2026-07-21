"use client";

import Link from "next/link";
import {
  Languages,
  Layers,
  MessageSquareText,
  Receipt,
  Settings,
  UserCog,
} from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { cn } from "@/lib/utils";
import type { Permission } from "@/lib/permissions";

const SETTINGS_SECTIONS = [
  {
    title: "Billing / Receipt",
    description: "Shop name, GSTIN, contact details, receipt prefix, and print footer.",
    href: "/settings/billing",
    icon: Receipt,
    status: "Available",
    permission: "settings.view",
  },
  {
    title: "Communication Templates",
    description: "Trial, delivery, payment, production, delay, and rework message wording.",
    href: "/settings/communication-templates",
    icon: MessageSquareText,
    status: "Available",
    permission: "settings.view",
  },
  {
    title: "Catalog",
    description: "Garment types, base prices, measurement fields, and add-ons.",
    href: "/catalog?tab=garment-types",
    icon: Layers,
    status: "Available",
    permission: "catalog.view",
  },
  {
    title: "Users & Access",
    description: "Users, roles, permissions, and account access.",
    href: "/users-access",
    icon: UserCog,
    status: "Available",
    anyOf: ["settings.manageUsers", "settings.manageRoles"],
  },
  {
    title: "Language",
    description: "English and Tamil selection is available from the top menu.",
    href: "",
    icon: Languages,
    status: "Top menu",
    permission: "settings.view",
  },
] as const;

function SettingsCard({
  section,
  enabled,
}: {
  section: (typeof SETTINGS_SECTIONS)[number];
  enabled: boolean;
}) {
  const Icon = section.icon;
  const content = (
    <div
      className={cn(
        "h-full rounded-xl border border-border-soft bg-white p-5 shadow-soft transition-colors",
        enabled && section.href ? "hover:border-primary hover:bg-primary-tint/30" : "opacity-75"
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-tint text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            section.status === "Available"
              ? "bg-chip-mint text-chip-mint-fg"
              : "bg-chip-info text-chip-info-fg"
          )}
        >
          {section.status}
        </span>
      </div>
      <h2 className="text-base font-semibold text-ink">{section.title}</h2>
      <p className="mt-1 text-sm leading-6 text-ink-muted">{section.description}</p>
    </div>
  );

  if (!enabled || !section.href) return content;
  return <Link href={section.href}>{content}</Link>;
}

function SettingsContent() {
  const { hasPermission, hasAnyPermission } = useCurrentUser();
  const visibleSections = SETTINGS_SECTIONS.filter((section) => {
    if ("anyOf" in section) return hasAnyPermission([...section.anyOf] as Permission[]);
    return hasPermission(section.permission as Permission);
  });

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-tint text-primary">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Settings</h1>
          <p className="text-sm text-ink-muted">
            Catalog rules, users, and configuration.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleSections.map((section) => (
          <SettingsCard
            key={section.title}
            section={section}
            enabled={section.status === "Available"}
          />
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequirePermission permission="settings.view">
      <SettingsContent />
    </RequirePermission>
  );
}
