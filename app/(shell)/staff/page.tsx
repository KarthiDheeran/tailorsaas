"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { getStaffListRowsAction, updateStaffAction } from "@/app/(shell)/staff/actions";
import type { StaffListRow } from "@/lib/staff";
import { StaffTabs, type StaffTab } from "@/components/staff/staff-tabs";
import { StaffTable } from "@/components/staff/staff-table";
import {
  StaffFilters,
  type StaffFilterState,
} from "@/components/staff/staff-filters";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";

const EMPTY_FILTERS: StaffFilterState = {
  nameQuery: "",
  role: "",
  status: "",
};

function StaffPageContent() {
  const { hasPermission } = useCurrentUser();
  const { t } = useLanguage();
  const canManage = hasPermission("staff.manage");
  const [tab, setTab] = useState<StaffTab>("list");
  const [filters, setFilters] = useState<StaffFilterState>(EMPTY_FILTERS);
  const [refreshKey, setRefreshKey] = useState(0);
  const [allRows, setAllRows] = useState<StaffListRow[]>([]);

  // ISO (UTC) date string — consistent between server and client renders,
  // unlike locale-formatted dates (see orders-table.tsx's formatDate note).
  const todayIso = new Date().toISOString().slice(0, 10);

  // Phase 5C: reads now go through a Server Action
  // (app/(shell)/staff/actions.ts) against the same server-side copy of the
  // mock staff array that the mutations write to, instead of a direct
  // client-side lib/staff.ts/lib/data/stub-data.ts import.
  useEffect(() => {
    let cancelled = false;
    getStaffListRowsAction(todayIso).then((rows) => {
      if (!cancelled) setAllRows(rows);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const rows = allRows.filter(({ staff }) => {
    const nameQuery = filters.nameQuery.trim().toLowerCase();
    if (nameQuery && !staff.name.toLowerCase().includes(nameQuery)) return false;
    if (filters.role && staff.role !== filters.role) return false;
    if (filters.status && staff.status !== filters.status) return false;
    return true;
  });

  async function handleDeactivate(staffId: string) {
    const member = allRows.find((r) => r.staff.id === staffId)?.staff;
    if (!member) return;
    if (!confirm(`Deactivate ${member.name}?`)) return;
    const result = await updateStaffAction(staffId, {
      name: member.name,
      phone: member.phone,
      role: member.role,
      joiningDate: member.joiningDate,
      address: member.address,
      emergencyContact: member.emergencyContact,
      status: "Inactive",
      notes: member.notes,
      paymentType: member.paymentType,
      baseSalary: member.baseSalary,
      pieceRates: member.pieceRates,
    });
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">{t("staff.title")}</h1>
          <p className="text-sm text-ink-muted">
            {allRows.length} {t("staff.onRecord")}
          </p>
        </div>
        {tab === "list" && canManage && (
          <Link
            href="/staff/new"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
          >
            <UserPlus className="h-4 w-4" />
            {t("staff.addStaff")}
          </Link>
        )}
      </div>

      <StaffTabs active={tab} onChange={setTab} />

      {tab === "list" && (
        <>
          <StaffFilters filters={filters} onChange={setFilters} />
          <StaffTable rows={rows} canManage={canManage} onDeactivate={handleDeactivate} />
        </>
      )}

      {tab === "work-queue" && (
        <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-xl border border-border-soft bg-white text-center shadow-soft">
          <p className="text-sm text-ink-muted">
            {t("staff.workQueueComingSoon")}
          </p>
        </div>
      )}

      {tab === "payments" && (
        <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-xl border border-border-soft bg-white text-center shadow-soft">
          <p className="text-sm text-ink-muted">
            {t("staff.paymentsComingSoon")}
          </p>
        </div>
      )}
    </div>
  );
}

export default function StaffPage() {
  return (
    <RequirePermission permission="staff.view">
      <StaffPageContent />
    </RequirePermission>
  );
}
