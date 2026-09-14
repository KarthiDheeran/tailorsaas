import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSourceModule } from "./source-module-fixture.mjs";

const layout = { columnsPerRow: 5, cells: [
  { id: "combined", fieldCodes: ["chest", "sleeve"], columnSpan: 2, height: "tall", textSize: "small", separator: "new-line", style: "emphasis", contentColumns: 2 },
] };

test("production layout validation supports configurable columns, spans, and two values", () => {
  const subject = loadSourceModule("lib/production-print-layout.ts");
  const rowCode = subject.productionPrintWorkDetailRowCode("work_details", 2);
  assert.deepEqual(subject.parseProductionPrintWorkDetailRowCode(rowCode), { fieldCode: "work_details", rowNumber: 2 });
  assert.equal(subject.parseProductionPrintWorkDetailRowCode("work_details"), null);
  assert.equal(subject.parseProductionPrintWorkDetailRowCode(subject.productionPrintWorkDetailRowCode("work_details", 51)), null);
  assert.deepEqual(subject.productionPrintWorkDetailRows([
    {},
    { item: "Long work item", qty: 2 },
    { item: "English", itemTa: "தமிழ்", qty: 1 },
  ]), ["", "Long work item - 2", "தமிழ் - 1"]);
  assert.equal(subject.isProductionPrintLayout(layout), true);
  assert.equal(subject.isProductionPrintLayout({ ...layout, columnsPerRow: 3 }), false);
  assert.equal(subject.isProductionPrintLayout({ ...layout, cells: [{ ...layout.cells[0], fieldCodes: ["a", "b", "c"] }] }), false);
  assert.equal(subject.isProductionPrintLayout({ ...layout, cells: [{ ...layout.cells[0], columnSpan: 6 }] }), false);
  assert.equal(subject.isProductionPrintLayout({ ...layout, cells: [{ ...layout.cells[0], style: "unknown" }] }), false);
  assert.equal(subject.isProductionPrintLayout({ ...layout, cells: [{ ...layout.cells[0], contentColumns: 4 }] }), false);
  assert.equal(subject.isProductionPrintLayout({ ...layout, cells: [{ ...layout.cells[0], style: undefined }] }), true);
  assert.equal(subject.normalizeProductionPrintLayout({ ...layout, cells: [{ ...layout.cells[0], style: undefined }] }).cells[0].style, "normal");
  for (const code of [subject.PRODUCTION_PRINT_EMPTY_BOX_CODE, subject.PRODUCTION_PRINT_BLANK_SPACE_CODE]) {
    assert.equal(subject.isProductionPrintLayout({ ...layout, cells: [{ ...layout.cells[0], fieldCodes: [code] }] }), true);
    assert.equal(subject.isProductionPrintLayout({ ...layout, cells: [{ ...layout.cells[0], fieldCodes: [code, "chest"] }] }), false);
  }
});

function layoutClient(rows, error = null) {
  const calls = [];
  const query = {
    select() { return this; }, eq(...args) { calls.push(["eq", ...args]); return this; },
    or(value) { calls.push(["or", value]); return this; }, is(...args) { calls.push(["is", ...args]); return this; },
    order() { return Promise.resolve({ data: rows, error }); },
  };
  return { calls, from() { return query; } };
}

test("garment layout overrides its category layout and category remains the fallback", async () => {
  const subject = loadSourceModule("lib/data/production-print-layouts-db.ts", {
    "@/lib/production-print-layout": loadSourceModule("lib/production-print-layout.ts"),
  });
  const category = { id: "category", order_section: "Chudidar", garment_type_id: null, columns_per_row: 6, cells: [{ ...layout.cells[0], columnSpan: 1 }], updated_at: "now" };
  const override = { id: "override", order_section: "Chudidar", garment_type_id: "garment-1", columns_per_row: 5, cells: layout.cells, updated_at: "now" };
  assert.deepEqual(await subject.getEffectiveProductionPrintLayout(layoutClient([category, override]), "Chudidar", "garment-1"), layout);
  assert.equal((await subject.getEffectiveProductionPrintLayout(layoutClient([category]), "Chudidar", "garment-2")).columnsPerRow, 6);
  const globalClient = layoutClient([category]);
  await subject.getEffectiveProductionPrintLayout(globalClient, "Chudidar", "garment-2");
  assert.ok(globalClient.calls.some((call) => call[0] === "eq" && call[1] === "is_global" && call[2] === true));
});

test("order printing selects the tenant's active global layout", async () => {
  const subject = loadSourceModule("lib/data/production-print-layouts-db.ts", {
    "@/lib/production-print-layout": loadSourceModule("lib/production-print-layout.ts"),
  });
  const oldCells = [{ ...layout.cells[0], fieldCodes: ["chest"] }];
  const newCells = [{ ...layout.cells[0], fieldCodes: ["__work_detail_row__:work_details:1"] }];
  const rows = [
    { id: "owner", tenant_id: "tenant", shop_id: "admin-shop", order_section: "Chudidar", garment_type_id: null, columns_per_row: 7, cells: newCells, updated_by: "owner-user", updated_at: "2026-09-14T02:00:00Z" },
    { id: "women", tenant_id: "tenant", shop_id: "women-shop", order_section: "Chudidar", garment_type_id: null, columns_per_row: 6, cells: oldCells, updated_by: "admin-user", updated_at: "2026-09-14T01:00:00Z" },
  ];
  const calls = [];
  const client = { from() { return { select() { return this; }, eq(...args) { calls.push(args); return this; }, or() { return this; }, is() { return this; }, order: async () => ({ data: rows.slice(0, 1), error: null }) }; } };
  const resolved = await subject.getEffectiveProductionPrintLayoutForOrder(client, "Chudidar", "garment-1", "tenant");
  assert.equal(resolved.columnsPerRow, 7);
  assert.deepEqual(resolved.cells, newCells);
  assert.ok(calls.some(([column, value]) => column === "tenant_id" && value === "tenant"));
  assert.ok(calls.some(([column, value]) => column === "is_global" && value === true));
  assert.ok(calls.some(([column, value]) => column === "is_active" && value === true));
});

test("new stitching slips snapshot the effective layout while cutting slips do not", async () => {
  let inserted;
  const row = {
    id: "slip", scan_token: "token", slip_code: "code", order_id: "order", order_item_serial_no: 1,
    unit_no: 1, order_number: "8", customer_id: "customer", customer_snapshot: { name: "A" },
    garment_type: "Chudidar", quantity: 1, delivery_date: "2026-09-20", stage: "Stitching",
    staff_id: null, staff_name: "Unassigned", wage_rate: 0, wage_amount: 0, tallied_quantity: 0,
    tally_wage_amount: 0, tally_extra_amount: 0, tally_notes: null, last_tallied_at: null,
    measurements_snapshot: {}, field_schema_snapshot: {}, production_layout_snapshot: layout,
    add_ons_snapshot: null, labour_add_ons_snapshot: null, notes: null, printed_at: "now", tallied_at: null, created_at: "now",
  };
  const supabase = { from() { return { insert(value) { inserted = value; return this; }, select() { return this; }, single: async () => ({ data: { ...row, stage: inserted.stage, production_layout_snapshot: inserted.production_layout_snapshot }, error: null }) }; } };
  const subject = loadSourceModule("lib/data/job-card-stage-slips-db.ts", {
    "@/lib/data/staff-db": { getStaffById: async () => undefined },
    "@/lib/staff-rates": { staffGarmentStageRate: () => 0 },
    "@/lib/data/production-print-layouts-db": { getEffectiveProductionPrintLayout: async () => layout },
  });
  const order = { id: "order", orderNumber: "8", orderSection: "Chudidar", customerId: "customer", customerSnapshot: { name: "A" }, deliveryDate: "2026-09-20", items: [{ serialNo: 1, particular: "Chudidar", garmentTypeId: "garment-1", qty: 1 }] };
  const stitching = await subject.createJobCardStageSlipForOrder(supabase, order, { orderId: "order", orderItemSerialNo: 1, unitNo: 1, stage: "Stitching" });
  assert.deepEqual(stitching.productionLayoutSnapshot, layout);
  await subject.createJobCardStageSlipForOrder(supabase, order, { orderId: "order", orderItemSerialNo: 1, unitNo: 1, stage: "Cutting" });
  assert.equal(inserted.production_layout_snapshot, null);
});

test("all stitching slips use the current configured layout when printed", async () => {
  let layoutLookups = 0;
  const subject = loadSourceModule("lib/data/job-card-stage-slips-db.ts", {
    "@/lib/data/production-print-layouts-db": {
      getEffectiveProductionPrintLayout: async () => { layoutLookups += 1; return layout; },
      getEffectiveProductionPrintLayoutForOrder: async () => { layoutLookups += 1; return layout; },
    },
  });
  const legacySlip = {
    id: "legacy", orderId: "order-14", orderItemSerialNo: 1, stage: "Stitching",
    productionLayoutSnapshot: undefined,
  };
  const snapshottedSlip = {
    ...legacySlip,
    id: "snapshotted",
    productionLayoutSnapshot: { columnsPerRow: 4, cells: [] },
  };
  const cuttingSlip = { ...legacySlip, id: "cutting", stage: "Cutting" };
  const order = {
    id: "order-14", orderSection: "Chudidar",
    items: [{ serialNo: 1, garmentTypeId: "garment-1" }],
  };
  const resolved = await subject.resolveProductionPrintLayoutsForSlips({}, [legacySlip, snapshottedSlip, cuttingSlip], [order]);
  assert.deepEqual(resolved[0].productionLayoutSnapshot, layout);
  assert.deepEqual(resolved[1].productionLayoutSnapshot, layout);
  assert.equal(resolved[2].productionLayoutSnapshot, undefined);
  assert.equal(layoutLookups, 1);
});

test("resetting the current layout makes old stitching slips use the built-in print grid", async () => {
  const subject = loadSourceModule("lib/data/job-card-stage-slips-db.ts", {
    "@/lib/data/production-print-layouts-db": { getEffectiveProductionPrintLayoutForOrder: async () => undefined },
  });
  const slip = {
    id: "old-slip", orderId: "order-15", orderItemSerialNo: 1, stage: "Stitching",
    productionLayoutSnapshot: layout,
  };
  const order = {
    id: "order-15", orderSection: "Chudidar",
    items: [{ serialNo: 1, garmentTypeId: "garment-1" }],
  };
  const [resolved] = await subject.resolveProductionPrintLayoutsForSlips({}, [slip], [order]);
  assert.equal(resolved.productionLayoutSnapshot, undefined);
});
