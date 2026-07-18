"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import {
  completeJobCardAction,
  startJobCardAction,
} from "@/app/(shell)/job-cards/actions";
import {
  getStaffPageDataAction,
  recordStaffPaymentAction,
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
import type { PaymentMode, Staff, StaffPayment, StaffWorkEarning } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";
import { formatCurrency } from "@/lib/currency";
import { paymentModes } from "@/lib/constants";
import { Select } from "@/components/ui/select";

const EMPTY_FILTERS: StaffFilterState = {
  nameQuery: "",
  role: "",
  status: "",
};

function StaffPageContent() {
  const { currentUser, hasPermission, isLoading } = useCurrentUser();
  const { t } = useLanguage();
  const canManage = hasPermission("staff.manage");
  const currentStaffId = currentUser?.staff_id ?? null;
  const [tab, setTab] = useState<StaffTab>("list");
  const [filters, setFilters] = useState<StaffFilterState>(EMPTY_FILTERS);
  const [refreshKey, setRefreshKey] = useState(0);
  const [allRows, setAllRows] = useState<StaffListRow[]>([]);
  const [workQueueRows, setWorkQueueRows] = useState<WorkQueueRow[]>([]);
  const [jobCardQueueRows, setJobCardQueueRows] = useState<JobCard[] | null>(null);
  const [staffPayments, setStaffPayments] = useState<StaffPayment[]>([]);
  const [staffWorkEarnings, setStaffWorkEarnings] = useState<StaffWorkEarning[]>([]);
  const [payingStaff, setPayingStaff] = useState<Staff | null>(null);
  const [viewingPayableStaff, setViewingPayableStaff] = useState<Staff | null>(null);
  const [payablePeriod, setPayablePeriod] = useState<PayablePeriod>("This Week");
  const [loadError, setLoadError] = useState<string | null>(null);
  // Named isDataLoading, not isLoading, since useCurrentUser() above already
  // owns that name for the auth/session load.
  const [isDataLoading, setIsDataLoading] = useState(true);

  // ISO (UTC) date string — consistent between server and client renders,
  // unlike locale-formatted dates (see orders-table.tsx's formatDate note).
  const todayIso = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (isLoading) return;
    if (!canManage && tab === "list") {
      setTab("work-queue");
    }
  }, [canManage, isLoading, tab]);

  useEffect(() => {
    let cancelled = false;
    getStaffPageDataAction(todayIso)
      .then((result) => {
        if (cancelled) return;
        setAllRows(result.staffRows);
        setWorkQueueRows(result.workQueueRows);
        setJobCardQueueRows(result.jobCardQueueRows);
        setStaffPayments(result.staffPayments);
        setStaffWorkEarnings(result.staffWorkEarnings);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Failed to load staff data."));
        }
      })
      .finally(() => {
        if (!cancelled) setIsDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, todayIso]);

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
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">
            {canManage ? t("staff.title") : t("nav.myTasks")}
          </h1>
          <p className="text-sm text-ink-muted">
            {canManage
              ? `${allRows.length} ${t("staff.onRecord")}`
              : t("staff.workQueue")}
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

      <StaffTabs active={tab} onChange={setTab} canManage={canManage} />

      {loadError && (
        <div className="mb-5">
          <LoadError message={loadError} onRetry={() => setRefreshKey((k) => k + 1)} />
        </div>
      )}

      {isDataLoading ? (
        <LoadingState label="Loading staff..." />
      ) : (
        <>
          {tab === "list" && canManage && (
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
                currentStaffId={currentStaffId}
                todayIso={todayIso}
                onChanged={() => setRefreshKey((k) => k + 1)}
              />
            ) : (
              <WorkQueueTable
                rows={workQueueRows}
                canManage={canManage}
                currentStaffId={currentStaffId}
                todayIso={todayIso}
                onChanged={() => setRefreshKey((k) => k + 1)}
              />
            )
          )}

          {tab === "payables" && canManage && (
            <StaffPayablesTable
              staffRows={allRows}
              earnings={staffWorkEarnings}
              payments={staffPayments}
              todayIso={todayIso}
              period={payablePeriod}
              onPeriodChange={setPayablePeriod}
              onRecordPayment={setPayingStaff}
              onViewDetails={setViewingPayableStaff}
            />
          )}

          {viewingPayableStaff && (
            <StaffPayableDetailsDrawer
              staff={viewingPayableStaff}
              earnings={staffWorkEarnings}
              payments={staffPayments}
              todayIso={todayIso}
              initialPeriod={payablePeriod}
              onRecordPayment={() => {
                setPayingStaff(viewingPayableStaff);
                setViewingPayableStaff(null);
              }}
              onClose={() => setViewingPayableStaff(null)}
            />
          )}

          {payingStaff && (
            <StaffPaymentDrawer
              staff={payingStaff}
              todayIso={todayIso}
              onClose={() => setPayingStaff(null)}
              onSaved={() => {
                setPayingStaff(null);
                setRefreshKey((key) => key + 1);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function JobCardWorkQueueTable({
  rows,
  canManage,
  currentStaffId,
  todayIso,
  onChanged,
}: {
  rows: JobCard[];
  canManage: boolean;
  currentStaffId: string | null;
  todayIso: string;
  onChanged: () => void;
}) {
  const assignedRows = rows
    .filter(
      (row) =>
        row.assignedStaffId &&
        (canManage || row.assignedStaffId === currentStaffId) &&
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
            <th className="whitespace-nowrap px-5 py-3 text-right">Actions</th>
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
              <td className="whitespace-nowrap px-5 py-3 text-right">
                {canManage || row.assignedStaffId === currentStaffId ? (
                  <>
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
                  </>
                ) : (
                  <span className="text-xs text-ink-faint">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type PayablePeriod = "This Week" | "This Month" | "All";
const PAYABLE_DETAIL_PREVIEW_LIMIT = 10;

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function payablePeriodRange(period: PayablePeriod, todayIso: string) {
  if (period === "All") return { start: undefined, end: undefined };
  if (period === "This Month") {
    const [year, month] = todayIso.split("-").map(Number);
    const monthEnd = new Date(year, month, 0);
    return { start: `${todayIso.slice(0, 7)}-01`, end: toIsoDate(monthEnd) };
  }
  const today = new Date(`${todayIso}T00:00:00`);
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return {
    start: toIsoDate(addDays(today, mondayOffset)),
    end: toIsoDate(addDays(today, mondayOffset + 6)),
  };
}

function payablePeriodLabel(period: PayablePeriod, todayIso: string, allLabel: string) {
  if (period === "All") return allLabel;
  const { start, end } = payablePeriodRange(period, todayIso);
  return `${period} - ${formatDate(start ?? todayIso)} to ${formatDate(end ?? todayIso)}`;
}

function isWithinPayablePeriod(dateIso: string | undefined, period: PayablePeriod, todayIso: string) {
  if (!dateIso) return false;
  const { start, end } = payablePeriodRange(period, todayIso);
  if (start && dateIso < start) return false;
  if (end && dateIso > end) return false;
  if (period === "This Month" && dateIso.slice(0, 7) !== todayIso.slice(0, 7)) return false;
  return true;
}

function StaffPayablesTable({
  staffRows,
  earnings,
  payments,
  todayIso,
  period,
  onPeriodChange,
  onRecordPayment,
  onViewDetails,
}: {
  staffRows: StaffListRow[];
  earnings: StaffWorkEarning[];
  payments: StaffPayment[];
  todayIso: string;
  period: PayablePeriod;
  onPeriodChange: (period: PayablePeriod) => void;
  onRecordPayment: (staff: Staff) => void;
  onViewDetails: (staff: Staff) => void;
}) {
  const rows = useMemo(
    () =>
      staffRows.map(({ staff }) => {
        const staffEarnings = earnings.filter(
          (earning) =>
            earning.staffId === staff.id &&
            isWithinPayablePeriod(earning.completedDate, period, todayIso)
        );
        const earned =
          staff.paymentType === "Salary" && period === "This Month"
            ? staff.baseSalary ?? 0
            : staffEarnings.reduce((sum, earning) => sum + Number(earning.wageAmount ?? 0), 0);
        const paid = payments
          .filter(
            (payment) =>
              payment.staffId === staff.id &&
              isWithinPayablePeriod(payment.date, period, todayIso)
          )
          .reduce((sum, payment) => sum + Number(payment.amount), 0);
        return {
          staff,
          completedUnits: staffEarnings.length,
          earned,
          paid,
          balance: earned - paid,
          isSalaryOutsideMonth: staff.paymentType === "Salary" && period !== "This Month",
        };
      }),
    [earnings, payments, period, staffRows, todayIso]
  );
  return (
    <div className="rounded-xl border border-border-soft bg-white shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Payables Summary</h2>
          <p className="text-xs text-ink-muted">
            {payablePeriodLabel(period, todayIso, "All recorded work and payments")}
          </p>
        </div>
        <div className="flex rounded-lg border border-border bg-white p-1">
          {(["This Week", "This Month", "All"] as PayablePeriod[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onPeriodChange(option)}
              className={cn(
                "h-8 rounded-md px-3 text-xs font-semibold transition-colors",
                period === option
                  ? "bg-primary-tint text-primary"
                  : "text-ink-muted hover:bg-surface hover:text-ink"
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">Staff</th>
            <th className="whitespace-nowrap px-5 py-3">Payment Type</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">Completed Units</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">Earned</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">Paid / Advance</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">Balance</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {rows.map((row) => (
            <tr key={row.staff.id} className="border-t border-border-soft hover:bg-surface">
              <td className="whitespace-nowrap px-5 py-3">
                <div className="font-semibold text-ink">{row.staff.name}</div>
                <div className="text-xs text-ink-muted">{row.staff.staffNumber}</div>
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {row.staff.paymentType}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                {row.staff.paymentType === "Salary" ? "-" : row.completedUnits}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-ink">
                {row.isSalaryOutsideMonth ? (
                  <span className="text-xs font-semibold text-ink-muted">Monthly salary</span>
                ) : (
                  formatCurrency(row.earned)
                )}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right text-ink-muted">
                {formatCurrency(row.paid)}
              </td>
              <td
                className={cn(
                  "whitespace-nowrap px-5 py-3 text-right font-semibold",
                  !row.isSalaryOutsideMonth && row.balance > 0 ? "text-chip-red-fg" : "text-ink"
                )}
              >
                {row.isSalaryOutsideMonth ? (
                  <span className="text-xs font-semibold text-ink-muted">-</span>
                ) : (
                  formatCurrency(row.balance)
                )}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onViewDetails(row.staff)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-surface hover:text-ink"
                  >
                    View Details
                  </button>
                  <button
                    type="button"
                    onClick={() => onRecordPayment(row.staff)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary-tint"
                  >
                    Record Payment
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function StaffPayableDetailsDrawer({
  staff,
  earnings,
  payments,
  todayIso,
  initialPeriod,
  onRecordPayment,
  onClose,
}: {
  staff: Staff;
  earnings: StaffWorkEarning[];
  payments: StaffPayment[];
  todayIso: string;
  initialPeriod: PayablePeriod;
  onRecordPayment: () => void;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState<PayablePeriod>(initialPeriod);
  const [showAllEarnings, setShowAllEarnings] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const periodEarnings = useMemo(
    () =>
      earnings
        .filter(
          (earning) =>
            earning.staffId === staff.id &&
            isWithinPayablePeriod(earning.completedDate, period, todayIso)
        )
        .sort((a, b) => b.completedDate.localeCompare(a.completedDate)),
    [earnings, period, staff.id, todayIso]
  );
  const periodPayments = useMemo(
    () =>
      payments
        .filter(
          (payment) =>
            payment.staffId === staff.id &&
            isWithinPayablePeriod(payment.date, period, todayIso)
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [payments, period, staff.id, todayIso]
  );

  const taskSummary = useMemo(() => {
    const byTask = new Map<string, { taskType: string; count: number; amount: number; rates: Set<number> }>();
    for (const earning of periodEarnings) {
      const current =
        byTask.get(earning.taskType) ??
        { taskType: earning.taskType, count: 0, amount: 0, rates: new Set<number>() };
      current.count += 1;
      current.amount += Number(earning.wageAmount);
      current.rates.add(Number(earning.wageRate));
      byTask.set(earning.taskType, current);
    }
    return Array.from(byTask.values()).sort((a, b) => a.taskType.localeCompare(b.taskType));
  }, [periodEarnings]);

  const earned =
    staff.paymentType === "Salary" && period === "This Month"
      ? staff.baseSalary ?? 0
      : periodEarnings.reduce((sum, earning) => sum + Number(earning.wageAmount), 0);
  const paid = periodPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const balance = earned - paid;
  const isSalaryOutsideMonth = staff.paymentType === "Salary" && period !== "This Month";
  const visibleEarnings = showAllEarnings
    ? periodEarnings
    : periodEarnings.slice(0, PAYABLE_DETAIL_PREVIEW_LIMIT);
  const visiblePayments = showAllPayments
    ? periodPayments
    : periodPayments.slice(0, PAYABLE_DETAIL_PREVIEW_LIMIT);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border-soft px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">Payable Details</h2>
            <p className="text-sm text-ink-muted">
              {staff.name} - {staff.staffNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink"
            aria-label="Close"
          >
            x
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-lg border border-border bg-white p-1">
              {(["This Week", "This Month", "All"] as PayablePeriod[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setPeriod(option);
                    setShowAllEarnings(false);
                    setShowAllPayments(false);
                  }}
                  className={cn(
                    "h-8 rounded-md px-3 text-xs font-semibold transition-colors",
                    period === option
                      ? "bg-primary-tint text-primary"
                      : "text-ink-muted hover:bg-surface hover:text-ink"
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="text-xs text-ink-muted">
              {payablePeriodLabel(period, todayIso, "All recorded work")}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border-soft bg-surface p-3">
              <p className="text-xs font-medium text-ink-muted">Earned</p>
              <p className="mt-1 text-lg font-semibold text-ink">
                {isSalaryOutsideMonth ? "Monthly salary" : formatCurrency(earned)}
              </p>
            </div>
            <div className="rounded-lg border border-border-soft bg-surface p-3">
              <p className="text-xs font-medium text-ink-muted">Paid / Advance</p>
              <p className="mt-1 text-lg font-semibold text-ink">{formatCurrency(paid)}</p>
            </div>
            <div className="rounded-lg border border-border-soft bg-surface p-3">
              <p className="text-xs font-medium text-ink-muted">Balance</p>
              <p className={cn("mt-1 text-lg font-semibold", balance > 0 ? "text-chip-red-fg" : "text-ink")}>
                {isSalaryOutsideMonth ? "-" : formatCurrency(balance)}
              </p>
            </div>
          </div>

          <section>
            <h3 className="text-sm font-semibold text-ink">Task Summary</h3>
            {staff.paymentType === "Salary" ? (
              <div className="mt-3 rounded-lg border border-border-soft p-3 text-sm text-ink-muted">
                Salary staff are tracked as a monthly payable. Switch to This Month to see salary due. Base salary:{" "}
                <span className="font-semibold text-ink">{formatCurrency(staff.baseSalary ?? 0)}</span>
              </div>
            ) : taskSummary.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-border-soft px-3 py-6 text-center text-sm text-ink-muted">
                No completed work in this period.
              </div>
            ) : (
              <div className="mt-3 overflow-hidden rounded-lg border border-border-soft">
                {taskSummary.map((summary) => {
                  const rateLabel =
                    summary.rates.size === 1
                      ? `${summary.count} x ${formatCurrency(Array.from(summary.rates)[0])}`
                      : `${summary.count} units`;
                  return (
                    <div
                      key={summary.taskType}
                      className="flex items-center justify-between gap-4 border-t border-border-soft px-3 py-2 first:border-t-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-ink">{summary.taskType}</p>
                        <p className="text-xs text-ink-muted">{rateLabel}</p>
                      </div>
                      <p className="text-sm font-semibold text-ink">{formatCurrency(summary.amount)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">Completed Work</h3>
              {periodEarnings.length > PAYABLE_DETAIL_PREVIEW_LIMIT && (
                <p className="text-xs text-ink-muted">
                  Showing {visibleEarnings.length} of {periodEarnings.length}
                </p>
              )}
            </div>
            {periodEarnings.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-border-soft px-3 py-6 text-center text-sm text-ink-muted">
                No completed job-card work in this period.
              </div>
            ) : (
              <>
                <div className="mt-3 overflow-hidden rounded-lg border border-border-soft">
                  {visibleEarnings.map((earning) => (
                    <div
                      key={earning.id}
                      className="grid gap-2 border-t border-border-soft px-3 py-2 text-sm first:border-t-0 sm:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <p className="font-semibold text-ink">
                          {earning.jobCardNumber} - {earning.taskType}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {formatDate(earning.completedDate)} - Rate {formatCurrency(earning.wageRate)}
                        </p>
                      </div>
                      <p className="font-semibold text-ink sm:text-right">{formatCurrency(earning.wageAmount)}</p>
                    </div>
                  ))}
                </div>
                {periodEarnings.length > PAYABLE_DETAIL_PREVIEW_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setShowAllEarnings((current) => !current)}
                    className="mt-2 text-xs font-semibold text-primary hover:underline"
                  >
                    {showAllEarnings
                      ? "Show fewer"
                      : `Show all ${periodEarnings.length} completed entries`}
                  </button>
                )}
              </>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">Payments / Advances</h3>
              {periodPayments.length > PAYABLE_DETAIL_PREVIEW_LIMIT && (
                <p className="text-xs text-ink-muted">
                  Showing {visiblePayments.length} of {periodPayments.length}
                </p>
              )}
            </div>
            {periodPayments.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-border-soft px-3 py-6 text-center text-sm text-ink-muted">
                No payments recorded in this period.
              </div>
            ) : (
              <>
                <div className="mt-3 overflow-hidden rounded-lg border border-border-soft">
                  {visiblePayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="grid gap-2 border-t border-border-soft px-3 py-2 text-sm first:border-t-0 sm:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <p className="font-semibold text-ink">{payment.description}</p>
                        <p className="text-xs text-ink-muted">
                          {formatDate(payment.date)} - {payment.paymentMode}
                        </p>
                        {payment.notes && (
                          <p className="mt-1 whitespace-pre-wrap text-xs text-ink-muted">{payment.notes}</p>
                        )}
                      </div>
                      <p className="font-semibold text-ink sm:text-right">{formatCurrency(payment.amount)}</p>
                    </div>
                  ))}
                </div>
                {periodPayments.length > PAYABLE_DETAIL_PREVIEW_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setShowAllPayments((current) => !current)}
                    className="mt-2 text-xs font-semibold text-primary hover:underline"
                  >
                    {showAllPayments
                      ? "Show fewer"
                      : `Show all ${periodPayments.length} payment entries`}
                  </button>
                )}
              </>
            )}
          </section>
        </div>

        <div className="flex justify-end gap-2 border-t border-border-soft px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-surface hover:text-ink"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onRecordPayment}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Record Payment
          </button>
        </div>
      </div>
    </div>
  );
}

function StaffPaymentDrawer({
  staff,
  todayIso,
  onClose,
  onSaved,
}: {
  staff: Staff;
  todayIso: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(todayIso);
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("Cash");
  const [description, setDescription] = useState("Staff advance / payment");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const result = await recordStaffPaymentAction({
      staffId: staff.id,
      date,
      description,
      amount: Number(amount),
      paymentMode,
      notes,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <form onSubmit={handleSubmit} className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="border-b border-border-soft px-6 py-5">
          <h2 className="text-lg font-semibold text-ink">Record Staff Payment</h2>
          <p className="text-sm text-ink-muted">{staff.name}</p>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Date</span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Amount</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Payment Mode</span>
            <Select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as PaymentMode)}>
              {paymentModes.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Description</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            />
          </label>
          {error && (
            <div className="rounded-lg bg-chip-red px-3 py-2 text-sm font-medium text-chip-red-fg">
              {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border-soft px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-surface hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Payment"}
          </button>
        </div>
      </form>
    </div>
  );
}

function WorkQueueTable({
  rows,
  canManage,
  currentStaffId,
  todayIso,
  onChanged,
}: {
  rows: WorkQueueRow[];
  canManage: boolean;
  currentStaffId: string | null;
  todayIso: string;
  onChanged: () => void;
}) {
  const visibleRows = canManage
    ? rows
    : rows.filter((row) => row.assignment.assignedStaffId === currentStaffId);

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

  if (visibleRows.length === 0) {
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
            <th className="whitespace-nowrap px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {visibleRows.map((row) => (
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
              <td className="whitespace-nowrap px-5 py-3 text-right">
                {canManage || row.assignment.assignedStaffId === currentStaffId ? (
                  <>
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
                  </>
                ) : (
                  <span className="text-xs text-ink-faint">-</span>
                )}
              </td>
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
