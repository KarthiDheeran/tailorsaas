"use client";

import { useState } from "react";
import { CustomersReportView } from "@/components/reports/customers-report-view";
import { OrdersReportView } from "@/components/reports/orders-report-view";
import { PaymentsReportView } from "@/components/reports/payments-report-view";
import { ReportsTabs, type ReportTab } from "@/components/reports/reports-tabs";
import { SalesReportView } from "@/components/reports/sales-report-view";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";

// Sales and Payments are purely financial tabs — hidden entirely for anyone
// without orders.viewPayments (Staff-like access), per the brief's "don't
// show financial reports/cards" rule. STAFF's preset also lacks reports.view
// outright, so this mainly guards a custom permission combination.
const ALL_TABS: ReportTab[] = ["sales", "payments", "orders", "customers"];
const NO_PAYMENTS_TABS: ReportTab[] = ["orders", "customers"];

function ReportsPageContent() {
  const { hasPermission } = useCurrentUser();
  const { t } = useLanguage();
  const canViewPayments = hasPermission("orders.viewPayments");
  const visibleTabs = canViewPayments ? ALL_TABS : NO_PAYMENTS_TABS;
  const [tab, setTab] = useState<ReportTab>(visibleTabs[0]);
  const activeTab = visibleTabs.includes(tab) ? tab : visibleTabs[0];
  // ISO (UTC) date string — consistent between server and client renders,
  // same reasoning as orders-table.tsx's formatDate hydration note.
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6 print:hidden">
        <h1 className="text-[26px] font-semibold text-ink">{t("reports.title")}</h1>
        <p className="text-sm text-ink-muted">
          {t("reports.subtitle")}
        </p>
      </div>

      <ReportsTabs active={activeTab} onChange={setTab} visibleTabs={visibleTabs} />

      {activeTab === "sales" && <SalesReportView todayIso={todayIso} />}
      {activeTab === "payments" && <PaymentsReportView todayIso={todayIso} />}
      {activeTab === "orders" && <OrdersReportView todayIso={todayIso} />}
      {activeTab === "customers" && <CustomersReportView todayIso={todayIso} />}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <RequirePermission permission="reports.view">
      <ReportsPageContent />
    </RequirePermission>
  );
}
