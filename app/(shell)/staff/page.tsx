"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { updateStaff } from "@/lib/data/stub-data";
import { getStaffListRows } from "@/lib/staff";
import { StaffTabs, type StaffTab } from "@/components/staff/staff-tabs";
import { StaffTable } from "@/components/staff/staff-table";
import {
  StaffFilters,
  type StaffFilterState,
} from "@/components/staff/staff-filters";

const EMPTY_FILTERS: StaffFilterState = {
  nameQuery: "",
  role: "",
  status: "",
};

export default function StaffPage() {
  const [tab, setTab] = useState<StaffTab>("list");
  const [filters, setFilters] = useState<StaffFilterState>(EMPTY_FILTERS);
  const [refreshKey, setRefreshKey] = useState(0);

  // ISO (UTC) date string — consistent between server and client renders,
  // unlike locale-formatted dates (see orders-table.tsx's formatDate note).
  const todayIso = new Date().toISOString().slice(0, 10);
  const allRows = getStaffListRows(todayIso);
  void refreshKey; // forces a re-render (and re-read of stub-data) after mutations

  const rows = allRows.filter(({ staff }) => {
    const nameQuery = filters.nameQuery.trim().toLowerCase();
    if (nameQuery && !staff.name.toLowerCase().includes(nameQuery)) return false;
    if (filters.role && staff.role !== filters.role) return false;
    if (filters.status && staff.status !== filters.status) return false;
    return true;
  });

  function handleDeactivate(staffId: string) {
    const member = allRows.find((r) => r.staff.id === staffId)?.staff;
    if (!member) return;
    if (!confirm(`Deactivate ${member.name}?`)) return;
    updateStaff(staffId, {
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
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Staff</h1>
          <p className="text-sm text-ink-muted">
            {allRows.length} staff on record
          </p>
        </div>
        {tab === "list" && (
          <Link
            href="/staff/new"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
          >
            <UserPlus className="h-4 w-4" />
            Add Staff
          </Link>
        )}
      </div>

      <StaffTabs active={tab} onChange={setTab} />

      {tab === "list" && (
        <>
          <StaffFilters filters={filters} onChange={setFilters} />
          <StaffTable rows={rows} onDeactivate={handleDeactivate} />
        </>
      )}

      {tab === "work-queue" && (
        <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-xl border border-border-soft bg-white text-center shadow-soft">
          <p className="text-sm text-ink-muted">
            Work Queue is coming in a later chunk.
          </p>
        </div>
      )}

      {tab === "payments" && (
        <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-xl border border-border-soft bg-white text-center shadow-soft">
          <p className="text-sm text-ink-muted">
            Staff Payments is coming in a later chunk.
          </p>
        </div>
      )}
    </div>
  );
}
