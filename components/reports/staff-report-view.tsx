"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Users } from "lucide-react";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { ReportActions } from "@/components/reports/report-actions";
import { ReportStatCard } from "@/components/reports/report-stat-card";
import { downloadCsv } from "@/lib/csv";
import { getStaffReportAction } from "@/app/(shell)/reports/actions";
import {
  getDateRangeForPreset,
  type DateRange,
  type DateRangePreset,
  type StaffReport,
} from "@/lib/reports";
import { useLanguage } from "@/components/i18n/language-provider";

// Staff tab — the "workload/productivity" item. Built over job_cards
// (assigned_staff_id), not lib/staff.ts's older getStaffListRows — see
// lib/reports.ts#getStaffReport's comment for why that selector's
// work_assignments source is stale for anything assigned since Phase 8.
export function StaffReportView({ todayIso }: { todayIso: string }) {
  const { t } = useLanguage();
  const [preset, setPreset] = useState<DateRangePreset>("thisMonth");
  const [customRange, setCustomRange] = useState<DateRange>({
    from: todayIso,
    to: todayIso,
  });
  const [report, setReport] = useState<StaffReport | null>({
    summary: { staffWithActiveWork: 0, totalDelayedJobs: 0, totalCompletedInRange: 0 },
    rows: [],
  });

  const range = getDateRangeForPreset(preset, todayIso, customRange);

  useEffect(() => {
    let cancelled = false;
    getStaffReportAction({ range }, todayIso).then((result) => {
      if (!cancelled) setReport(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, todayIso]);

  function handleExport() {
    if (!report) return;
    downloadCsv(
      `staff-report-${todayIso}.csv`,
      ["Staff Name", "Role", "Active Jobs", "Delayed Jobs", "Completed in Range", "Total Assigned"],
      report.rows.map((r) => [
        r.staff.name,
        r.staff.role,
        r.activeJobs,
        r.delayedJobs,
        r.completedInRange,
        r.totalAssigned,
      ])
    );
  }

  if (report === null) {
    return (
      <div className="rounded-xl border border-border-soft bg-white p-4 text-sm text-ink-muted shadow-soft">
        {t("reports.jobCardsSetupPending")}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter
          preset={preset}
          custom={customRange}
          onPresetChange={setPreset}
          onCustomChange={setCustomRange}
        />
        <ReportActions onExport={handleExport} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ReportStatCard
          label={t("reports.staffWithActiveWork")}
          value={String(report.summary.staffWithActiveWork)}
          icon={Users}
        />
        <ReportStatCard
          label={t("reports.totalDelayedJobs")}
          value={String(report.summary.totalDelayedJobs)}
          icon={AlertTriangle}
          tone={report.summary.totalDelayedJobs > 0 ? "warning" : "default"}
        />
        <ReportStatCard
          label={t("reports.completedInRange")}
          value={String(report.summary.totalCompletedInRange)}
          icon={CheckCircle2}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
        <table className="w-full text-left">
          <thead className="text-[13px] font-semibold text-ink-muted">
            <tr className="border-b border-border-soft">
              <th className="whitespace-nowrap px-5 py-3">{t("common.name")}</th>
              <th className="whitespace-nowrap px-5 py-3">{t("reports.activeJobs")}</th>
              <th className="whitespace-nowrap px-5 py-3">{t("reports.delayedJobs")}</th>
              <th className="whitespace-nowrap px-5 py-3">{t("reports.completedInRange")}</th>
              <th className="whitespace-nowrap px-5 py-3">{t("reports.totalAssigned")}</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {report.rows.map((row) => (
              <tr key={row.staff.id} className="border-t border-border-soft hover:bg-surface">
                <td className="whitespace-nowrap px-5 py-3">
                  <div className="font-medium text-ink">{row.staff.name}</div>
                  <div className="text-xs text-ink-muted">{row.staff.role}</div>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink">{row.activeJobs}</td>
                <td className="whitespace-nowrap px-5 py-3">
                  <span className={row.delayedJobs > 0 ? "font-semibold text-chip-red-fg" : "text-ink-muted"}>
                    {row.delayedJobs}
                  </span>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink">{row.completedInRange}</td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">{row.totalAssigned}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.rows.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border-soft bg-white p-8 text-center text-sm text-ink-muted">
          {t("reports.noStaffMatch")}
        </div>
      )}
    </div>
  );
}
