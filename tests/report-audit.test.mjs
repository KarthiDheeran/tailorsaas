import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSourceModule } from "./source-module-fixture.mjs";

test("SECURITY: reports retain caller tenant scope after permission verification", async () => {
  const cookieClient = { tenant: "tenant-A" };
  const serviceClient = { tenant: null };
  const action = loadSourceModule("app/(shell)/reports/actions.ts", {
    "@/lib/supabase/server": { createClient: () => cookieClient },
    "@/lib/supabase/admin": { createAdminClient: () => serviceClient },
    "@/lib/auth/require-server-permission": { requireServerPermission: async () => ({ ok: true, userId: "user-A" }) },
    "@/lib/reports": { getSalesReport: async (client) => ({ tenant: client.tenant }) },
  });
  const result = await action.getSalesReportAction({ from: "2026-09-11", to: "2026-09-11" });
  assert.equal(result.tenant, "tenant-A", "Report data access must retain the authenticated caller's tenant boundary");
});

test("SECURITY: financial report actions enforce the payment-view permission", async () => {
  const checked = [];
  let financialDataRead = false;
  const action = loadSourceModule("app/(shell)/reports/actions.ts", {
    "@/lib/supabase/server": { createClient: () => ({}) },
    "@/lib/supabase/admin": { createAdminClient: () => ({}) },
    "@/lib/auth/require-server-permission": { requireServerPermission: async (_client, permission) => {
      checked.push(permission);
      return { ok: permission === "reports.view", userId: "report-only-user" };
    } },
    "@/lib/reports": { getSalesReport: async () => { financialDataRead = true; return { totalSales: 1000 }; } },
  });
  await action.getSalesReportAction({ from: "2026-09-11", to: "2026-09-11" });
  assert.ok(checked.includes("orders.viewPayments") && !financialDataRead, "Hiding financial tabs in the browser is insufficient; the action must deny the request");
});

test("FINANCE: revenue collected includes today's payment for an older undelivered order", async () => {
  const finance = loadSourceModule("lib/order-finance.ts");
  const subject = loadSourceModule("lib/reports.ts", {
    "@/lib/order-finance": finance,
    // The order was placed earlier and is due later, so neither date-filtered
    // order query returns it. Its ledger does contain a payment received today.
    "@/lib/data/orders-db": { getOrderListRowsInDateRange: async () => [] },
    "@/lib/data/payments-db": { getPayments: async () => [{ amount: 300, paymentDate: "2026-09-11", voided: false, orderId: "older-order" }] },
  });
  const result = await subject.getSalesReport({}, { from: "2026-09-11", to: "2026-09-11" });
  assert.equal(result.revenueCollected, 300, "Collections must follow the payment date, not the order placement/delivery dates");
  assert.equal(result.rows[0].amountCollected, 300);
  assert.equal(result.rows[0].date, "2026-09-11");
  assert.equal(result.monthlyRows[0].amountCollected, 300);
});

test("collections exclude voids and use ledger payment-mode/date filters", async () => {
  let receivedFilters;
  const subject = loadSourceModule("lib/reports.ts", {
    "@/lib/data/orders-db": { getOrderListRowsInDateRange: async () => [] },
    "@/lib/data/payments-db": { getPayments: async (_client, filters) => {
      receivedFilters = filters;
      return [
        { amount: 300, paymentDate: "2026-09-11", paymentMode: "Cash", voided: false },
        { amount: 200, paymentDate: "2026-09-12", paymentMode: "Cash", voided: false },
        { amount: 999, paymentDate: "2026-09-11", paymentMode: "Cash", voided: true },
      ];
    } },
  });
  const result = await subject.getSalesReport({}, { from: "2026-09-11", to: "2026-09-12" }, "Cash");
  assert.deepEqual(receivedFilters, { from: "2026-09-11", to: "2026-09-12", paymentMode: "Cash" });
  assert.equal(result.revenueCollected, 500);
  assert.equal(result.rows.reduce((total, row) => total + row.amountCollected, 0), 500);
  assert.equal(result.monthlyRows[0].amountCollected, 500);
});

test("payment and expense report actions deny report-only roles before reading data", async () => {
  const reads = [];
  const action = loadSourceModule("app/(shell)/reports/actions.ts", {
    "@/lib/supabase/server": { createClient: () => ({}) },
    "@/lib/auth/require-server-permission": { requireServerPermission: async (_client, permission) => ({ ok: permission === "reports.view", userId: "report-only" }) },
    "@/lib/reports": {
      getPaymentsReport: async () => reads.push("payments"),
      getExpensesTotal: async () => reads.push("expenses"),
    },
  });
  const range = { from: "2026-09-11", to: "2026-09-11" };
  assert.equal(await action.getPaymentsReportAction({ range }, range.to), null);
  assert.equal(await action.getReportExpensesTotalAction(range), null);
  assert.deepEqual(reads, []);
});
