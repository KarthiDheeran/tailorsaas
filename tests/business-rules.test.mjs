import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSourceModule } from "./source-module-fixture.mjs";

const finance = loadSourceModule("lib/order-finance.ts");
const tax = loadSourceModule("lib/order-tax.ts");
const permissions = loadSourceModule("lib/permissions.ts");
const reports = loadSourceModule("lib/reports.ts", { "@/lib/order-finance": finance });

test("cancelled orders are excluded from receivables while delivered balances remain due", () => {
  assert.equal(finance.orderBalance({ status: "Cancelled", balance: 700 }), 0);
  assert.equal(finance.isReceivableOrder({ status: "Cancelled", balance: 700 }), false);
  assert.equal(finance.isReceivableOrder({ status: "Delivered", balance: 700 }), true);
  assert.equal(finance.orderBalance({ status: "Ready", balance: -50 }), 0);
});

test("tax-inclusive and tax-exclusive amounts reconcile", () => {
  const exclusive = tax.getOrderTaxBreakdown(1000, { taxEnabled: true, taxRatePercent: 18, pricesIncludeTax: false });
  const inclusive = tax.getOrderTaxBreakdown(1180, { taxEnabled: true, taxRatePercent: 18, pricesIncludeTax: true });
  for (const result of [exclusive, inclusive]) {
    assert.ok(Math.abs(result.taxableValue - 1000) < 0.000001);
    assert.ok(Math.abs(result.taxAmount - 180) < 0.000001);
    assert.ok(Math.abs(result.cgstAmount + result.sgstAmount - result.taxAmount) < 0.000001);
    assert.equal(result.totalWithTax, 1180);
  }
});

test("disabled and zero-rate tax do not add charges", () => {
  assert.equal(tax.orderTotalWithTax(1000, { taxEnabled: false, taxRatePercent: 18 }), 1000);
  assert.equal(tax.orderTotalWithTax(1000, { taxEnabled: true, taxRatePercent: 0 }), 1000);
  assert.equal(tax.getOrderTaxBreakdown(0, { taxEnabled: true, taxRatePercent: 18, pricesIncludeTax: false }).totalWithTax, 0);
});

test("permission checks do not grant unrelated privileges", () => {
  assert.equal(permissions.hasPermission(undefined, "orders.edit"), false);
  assert.equal(permissions.hasPermission(["orders.view"], "orders.edit"), false);
  assert.equal(permissions.hasPermission(["reports.view"], "orders.viewPayments"), false);
  assert.equal(permissions.hasPermission({ permissions: ["orders.edit"] }, "orders.edit"), true);
});

test("report date ranges cover year boundaries, leap days, and Sunday weeks", () => {
  assert.deepEqual(reports.getDateRangeForPreset("yesterday", "2026-01-01"), { from: "2025-12-31", to: "2025-12-31" });
  assert.deepEqual(reports.getDateRangeForPreset("yesterday", "2024-03-01"), { from: "2024-02-29", to: "2024-02-29" });
  assert.deepEqual(reports.getDateRangeForPreset("thisWeek", "2026-09-13"), { from: "2026-09-07", to: "2026-09-13" });
  assert.deepEqual(reports.getDateRangeForPreset("thisMonth", "2026-09-11"), { from: "2026-09-01", to: "2026-09-11" });
});

test("sales reports exclude cancelled orders from sales and balances", async () => {
  const active = { id: "active", status: "In Progress", totalAmount: 1000, advancePaid: 200, balance: 800, orderDate: "2026-09-11", deliveryDate: "2026-09-20", paymentMode: "Cash", items: [{ particular: "Shirt", qty: 1, amount: 1000 }] };
  const cancelled = { ...active, id: "cancelled", status: "Cancelled", totalAmount: 9999 };
  const subject = loadSourceModule("lib/reports.ts", {
    "@/lib/order-finance": finance,
    "@/lib/data/orders-db": { getOrderListRowsInDateRange: async (_client, field) => field === "order_date" ? [active, cancelled] : [] },
    "@/lib/data/payments-db": { getPayments: async () => [] },
  });
  const result = await subject.getSalesReport({}, { from: "2026-09-11", to: "2026-09-11" });
  assert.equal(result.totalOrders, 1);
  assert.equal(result.totalSales, 1000);
  assert.equal(result.rows[0].balancePending, 800);
});
