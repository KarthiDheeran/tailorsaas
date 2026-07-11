"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import {
  completeJobCardAction,
  getJobCardsAction,
  startJobCardAction,
} from "@/app/(shell)/job-cards/actions";
import {
  getStaffListRowsAction,
  getWorkQueueRowsAction,
  updateStaffAction,
  updateWorkAssignmentAction,
} from "@/app/(shell)/staff/actions";
import type { StaffListRow, WorkQueueRow } from "@/lib/staff";
import { StaffTabs, type StaffTab } from "@/components/staff/staff-tabs";
import { StaffTable } from "@/components/staff/staff-table";
import {
  StaffFilters,
  type StaffFilterState,
} from "@/components/staff/staff-filters";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { formatDate } from "@/components/orders/orders-table";
import type { JobCard } from "@/lib/job-cards";
import { cn } from "@/lib/utils";

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
  const [workQueueRows, setWorkQueueRows] = useState<WorkQueueRow[]>([]);
  const [jobCardQueueRows, setJobCardQueueRows] = useState<JobCard[] | null>(null);

  // ISO (UTC) date string — consistent between server and client renders,
  // unlike locale-formatted dates (see orders-table.tsx's formatDate note).
  const todayIso = new Date().toISOString().slice(0, 10);

  // Phase 5C: reads now go through a Server Action
  // (app/(shell)/staff/actions.ts) against the same server-side copy of the
  // mock staff array that the mutations write to, instead of a direct
  // client-side lib/staff.ts/lib/data/stub-data.ts import.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getStaffListRowsAction(todayIso),
      getWorkQueueRowsAction(todayIso),
      getJobCardsAction(todayIso),
    ]).then(
      ([staffRows, queueRows, jobCards]) => {
        if (cancelled) return;
        setAllRows(staffRows);
        setWorkQueueRows(queueRows);
        setJobCardQueueRows(jobCards);
      }
    );
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
        jobCardQueueRows !== null ? (
          <JobCardWorkQueueTable
            rows={jobCardQueueRows}
            canManage={canManage}
            todayIso={todayIso}
            onChanged={() => setRefreshKey((k) => k + 1)}
          />
        ) : (
          <WorkQueueTable
            rows={workQueueRows}
            canManage={canManage}
            todayIso={todayIso}
            onChanged={() => setRefreshKey((k) => k + 1)}
          />
        )
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

function JobCardWorkQueueTable({
  rows,
  canManage,
  todayIso,
  onChanged,
}: {
  rows: JobCard[];
  canManage: boolean;
  todayIso: string;
  onChanged: () => void;
}) {
  const assignedRows = rows
    .filter(
      (row) =>
        row.assignedStaffId &&
        row.productionBucket !== "Closed" &&
        row.stage !== "Ready"
    )
    .sort((a, b) => (a.deliveryDate < b.deliveryDate ? -1 : 1));

  async function markStarted(row: JobCard) {
    const result = await startJobCardAction(row.id, todayIso);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    onChanged();
  }

  async function markCompleted(row: JobCard) {
    const result = await completeJobCardAction(row.id, todayIso);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    onChanged();
  }

  if (assignedRows.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-xl border border-border-soft bg-white text-center shadow-soft">
        <p className="text-sm text-ink-muted">No job cards assigned yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">Job Card</th>
            <th className="whitespace-nowrap px-5 py-3">Garment</th>
            <th className="whitespace-nowrap px-5 py-3">Stage</th>
            <th className="whitespace-nowrap px-5 py-3">Assigned To</th>
            <th className="whitespace-nowrap px-5 py-3">Due Date</th>
            <th className="whitespace-nowrap px-5 py-3">Priority</th>
            <th className="whitespace-nowrap px-5 py-3">Status</th>
            {canManage && <th className="whitespace-nowrap px-5 py-3 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {assignedRows.map((row) => (
            <tr key={row.id} className="border-t border-border-soft hover:bg-surface">
              <td className="whitespace-nowrap px-5 py-3 font-semibold text-primary">
                {row.jobCardNumber}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink">{row.garment}</td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {row.taskType ?? row.stage}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {row.assignedTo}
              </td>
              <td
                className={cn(
                  "whitespace-nowrap px-5 py-3",
                  row.isDelayed ? "font-semibold text-chip-red-fg" : "text-ink-muted"
                )}
              >
                {formatDate(row.deliveryDate)}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {row.priority ?? "Normal"}
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    row.taskStatus === "Completed"
                      ? "bg-chip-mint text-chip-mint-fg"
                      : row.taskStatus === "Delayed"
                        ? "bg-chip-red text-chip-red-fg"
                        : row.taskStatus === "In Progress"
                          ? "bg-chip-blue text-chip-blue-fg"
                          : "bg-chip-info text-chip-info-fg"
                  )}
                >
                  {row.taskStatus ?? "Assigned"}
                </span>
              </td>
              {canManage && (
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  {!row.startedDate && !row.completedDate && (
                    <button
                      type="button"
                      onClick={() => markStarted(row)}
                      className="mr-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-surface"
                    >
                      Start
                    </button>
                  )}
                  {row.startedDate && !row.completedDate && (
                    <button
                      type="button"
                      onClick={() => markCompleted(row)}
                      className="rounded-lg border border-primary bg-primary-tint px-3 py-1.5 text-xs font-semibold text-primary"
                    >
                      {row.stage === "Ready" ? "Complete" : "Complete Stage"}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkQueueTable({
  rows,
  canManage,
  todayIso,
  onChanged,
}: {
  rows: WorkQueueRow[];
  canManage: boolean;
  todayIso: string;
  onChanged: () => void;
}) {
  async function markStarted(row: WorkQueueRow) {
    const result = await updateWorkAssignmentAction(row.assignment.id, {
      startedDate: todayIso,
    });
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    onChanged();
  }

  async function markCompleted(row: WorkQueueRow) {
    const result = await updateWorkAssignmentAction(row.assignment.id, {
      completedDate: todayIso,
    });
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    onChanged();
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-xl border border-border-soft bg-white text-center shadow-soft">
        <p className="text-sm text-ink-muted">No work assigned yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">Order</th>
            <th className="whitespace-nowrap px-5 py-3">Garment</th>
            <th className="whitespace-nowrap px-5 py-3">Task</th>
            <th className="whitespace-nowrap px-5 py-3">Assigned To</th>
            <th className="whitespace-nowrap px-5 py-3">Due Date</th>
            <th className="whitespace-nowrap px-5 py-3">Priority</th>
            <th className="whitespace-nowrap px-5 py-3">Status</th>
            {canManage && <th className="whitespace-nowrap px-5 py-3 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {rows.map((row) => (
            <tr key={row.assignment.id} className="border-t border-border-soft hover:bg-surface">
              <td className="whitespace-nowrap px-5 py-3 font-semibold text-primary">
                {row.order.orderNumber}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink">
                {row.item.particular} x{row.item.qty}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {row.assignment.taskType}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {row.staff?.name ?? "Unknown"}
              </td>
              <td
                className={cn(
                  "whitespace-nowrap px-5 py-3",
                  row.status === "Delayed" ? "font-semibold text-chip-red-fg" : "text-ink-muted"
                )}
              >
                {formatDate(row.assignment.dueDate)}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {row.assignment.priority}
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    row.status === "Completed"
                      ? "bg-chip-mint text-chip-mint-fg"
                      : row.status === "Delayed"
                        ? "bg-chip-red text-chip-red-fg"
                        : row.status === "In Progress"
                          ? "bg-chip-blue text-chip-blue-fg"
                          : "bg-chip-info text-chip-info-fg"
                  )}
                >
                  {row.status}
                </span>
              </td>
              {canManage && (
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  {!row.assignment.startedDate && !row.assignment.completedDate && (
                    <button
                      type="button"
                      onClick={() => markStarted(row)}
                      className="mr-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-surface"
                    >
                      Start
                    </button>
                  )}
                  {row.assignment.startedDate && !row.assignment.completedDate && (
                    <button
                      type="button"
                      onClick={() => markCompleted(row)}
                      className="rounded-lg border border-primary bg-primary-tint px-3 py-1.5 text-xs font-semibold text-primary"
                    >
                      Complete
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
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
