"use client";

import { useState } from "react";
import { CustomersReportView } from "@/components/reports/customers-report-view";
import { OrdersReportView } from "@/components/reports/orders-report-view";
import { PaymentsReportView } from "@/components/reports/payments-report-view";
import { ReportsTabs, type ReportTab } from "@/components/reports/reports-tabs";
import { SalesReportView } from "@/components/reports/sales-report-view";

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("sales");
  // ISO (UTC) date string — consistent between server and client renders,
  // same reasoning as orders-table.tsx's formatDate hydration note.
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6 print:hidden">
        <h1 className="text-[26px] font-semibold text-ink">Reports</h1>
        <p className="text-sm text-ink-muted">
          Sales, payments, orders and customer reports
        </p>
      </div>

      <ReportsTabs active={tab} onChange={setTab} />

      {tab === "sales" && <SalesReportView todayIso={todayIso} />}
      {tab === "payments" && <PaymentsReportView todayIso={todayIso} />}
      {tab === "orders" && <OrdersReportView todayIso={todayIso} />}
      {tab === "customers" && <CustomersReportView todayIso={todayIso} />}
    </div>
  );
}
