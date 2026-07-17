"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getCustomerStatementAction } from "@/app/(shell)/customers/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { PrintPageFrame } from "@/components/orders/print/print-page-frame";
import { formatDate } from "@/components/orders/orders-table";
import { formatCurrency } from "@/lib/currency";
import type { CustomerStatement, CustomerStatementRow } from "@/lib/customer-statement";

function money(value: number) {
  return formatCurrency(value);
}

function generatedLabel(iso: string) {
  const [date, time] = iso.split("T");
  return `${formatDate(date)} ${time.slice(0, 5)}`;
}

function amountCell(value: number, tone: "debit" | "credit" | "balance") {
  if (value === 0) return <span className="text-gray-400">-</span>;
  const color =
    tone === "credit"
      ? "text-emerald-700"
      : tone === "debit"
        ? "text-gray-900"
        : value > 0
          ? "text-red-700"
          : "text-emerald-700";
  return <span className={`font-semibold ${color}`}>{money(value)}</span>;
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-300 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-base font-bold text-gray-950">{value}</p>
    </div>
  );
}

function rowBadgeClass(type: CustomerStatementRow["type"]) {
  if (type === "Payment" || type === "Discount") return "border-emerald-700 text-emerald-800";
  if (type === "Refund" || type === "Extra Charge") return "border-red-700 text-red-800";
  return "border-gray-700 text-gray-800";
}

function StatementRows({ rows }: { rows: CustomerStatementRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
        No active financial activity for this customer.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-y border-gray-300 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
            <th className="px-3 py-2 font-semibold">Date</th>
            <th className="px-3 py-2 font-semibold">Type</th>
            <th className="px-3 py-2 font-semibold">Order</th>
            <th className="px-3 py-2 font-semibold">Description</th>
            <th className="px-3 py-2 text-right font-semibold">Debit</th>
            <th className="px-3 py-2 text-right font-semibold">Credit</th>
            <th className="px-3 py-2 text-right font-semibold">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-200 align-top">
              <td className="whitespace-nowrap px-3 py-3 text-gray-700">
                {formatDate(row.date)}
              </td>
              <td className="px-3 py-3">
                <span
                  className={`inline-block whitespace-nowrap border px-2 py-0.5 text-[11px] font-bold ${rowBadgeClass(row.type)}`}
                >
                  {row.type}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-3">
                <Link
                  href={`/orders?view=${row.orderId}`}
                  className="inline-flex items-center gap-1 font-semibold text-gray-900 underline-offset-2 hover:underline print:no-underline"
                >
                  {row.invoiceNumber ?? row.orderNumber}
                  <ExternalLink className="h-3 w-3 print:hidden" />
                </Link>
              </td>
              <td className="max-w-xs px-3 py-3 text-gray-700">{row.description}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right">
                {amountCell(row.debit, "debit")}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right">
                {amountCell(row.credit, "credit")}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right">
                {amountCell(row.runningBalance, "balance")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomerStatementContent({ params }: { params: { id: string } }) {
  const [statement, setStatement] = useState<CustomerStatement | null | undefined>(
    undefined
  );

  useEffect(() => {
    let cancelled = false;
    getCustomerStatementAction(params.id).then((result) => {
      if (!cancelled) setStatement(result ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (statement === undefined) return null;
  if (statement === null) notFound();

  const { customer, summary, rows } = statement;

  return (
    <PrintPageFrame
      backHref={`/customers/${customer.id}`}
      backLabel="Back to customer"
    >
      <div className="border-b-2 border-black pb-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold">Customer Statement</h1>
            <p className="mt-1 text-sm text-gray-600">
              Active order ledger and outstanding balance
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="text-gray-500">Generated</p>
            <p className="font-semibold">{generatedLabel(statement.generatedAt)}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Customer</p>
          <p className="font-semibold">{customer.name}</p>
          <p className="text-gray-700">{customer.customerNumber}</p>
        </div>
        <div>
          <p className="text-gray-500">Contact</p>
          <p className="font-semibold">{customer.phone}</p>
          <p className="text-gray-700">{customer.area}</p>
        </div>
        <div className="col-span-2">
          <p className="text-gray-500">Address</p>
          <p className="font-semibold">{customer.address || "-"}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryBox label="Active Orders" value={String(summary.activeOrders)} />
        <SummaryBox label="Billed" value={money(summary.billedTotal)} />
        <SummaryBox label="Net Paid" value={money(summary.netPaid)} />
        <SummaryBox label="Outstanding" value={money(summary.outstandingBalance)} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-5">
        <SummaryBox label="Garments" value={money(summary.itemCharges)} />
        <SummaryBox label="Extra Charges" value={money(summary.extraCharges)} />
        <SummaryBox label="Discounts" value={money(summary.discounts)} />
        <SummaryBox label="Payments" value={money(summary.payments)} />
        <SummaryBox label="Refunds" value={money(summary.refunds)} />
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-950">Ledger</h2>
            <p className="text-xs text-gray-500">
              Debit increases balance. Credit reduces balance.
            </p>
          </div>
          <p className="text-sm font-bold text-gray-950">
            Closing Balance: {money(summary.outstandingBalance)}
          </p>
        </div>
        <StatementRows rows={rows} />
      </div>

      <p className="mt-6 border-t border-gray-300 pt-3 text-xs text-gray-500">
        Cancelled orders and voided payments or adjustments are excluded from this
        active customer statement.
      </p>
    </PrintPageFrame>
  );
}

export default function CustomerStatementPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <RequirePermission allOf={["customers.view", "orders.viewPayments"]}>
      <CustomerStatementContent params={params} />
    </RequirePermission>
  );
}
