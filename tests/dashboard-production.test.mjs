import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSourceModule } from "./source-module-fixture.mjs";

async function summary({ stages = ["Unassigned", "Unassigned", "Unassigned"], slips = [], activityLogs = [], filter } = {}) {
  const order = { id: "mens-order", orderDate: "2026-09-13", status: "Confirmed", items: [] };
  const cards = stages.map((stage, index) => ({
    id: `card-${index}`, orderId: order.id, orderNumber: "101",
    item: { serialNo: 1 }, unitNo: index + 1, garment: "Half Shirt",
    stage, orderStatus: "Confirmed", deliveryDate: "2026-09-20",
  }));
  const subject = loadSourceModule("lib/dashboard.ts", {
    "@/lib/data/orders-db": {
      getOrderListRowsInDateRange: async () => [],
      getReceivableOrderListRows: async () => [],
      getActiveUrgentOrderListRows: async () => [],
      getOrderListRowsByIds: async () => [order],
    },
    "@/lib/data/job-cards-db": { getJobCardReportRows: async () => cards },
    "@/lib/data/job-card-stage-slips-db": { getJobCardStageSlipsForOrders: async () => slips },
    "@/lib/data/job-card-activity-db": { getJobCardActivityLogsForCards: async () => activityLogs },
    "@/lib/data/expenses-db": { getExpenses: async () => [] },
    "@/lib/order-finance": { isActiveOrder: () => true, isReceivableOrder: () => true },
    "@/lib/currency": { formatCurrency: String },
  });
  return subject.getDashboardData({}, "2026-09-13", filter);
}

const cutting = { orderId: "mens-order", orderItemSerialNo: 1, unitNo: 1, stage: "Cutting", quantity: 3, talliedQuantity: 2 };

test("partial cutting tally advances only completed units, without double counting reprints", async () => {
  const result = await summary({ slips: [cutting, cutting] });
  assert.deepEqual(result.garmentSummary, [
    { garment: "Half Shirt", stage: "Stitching", quantity: 2 },
    { garment: "Half Shirt", stage: "Unassigned", quantity: 1 },
  ]);
  assert.equal(result.stagePendingSummary[0].pendingPieces, 1);
});

test("summary filters use production progress and retain date boundaries", async () => {
  const result = await summary({ slips: [cutting], filter: { stage: "Stitching" } });
  assert.deepEqual(result.garmentSummary, [{ garment: "Half Shirt", stage: "Stitching", quantity: 2 }]);
  const outside = await summary({ slips: [cutting], filter: { from: "2026-09-12", to: "2026-09-12" } });
  assert.deepEqual(outside.garmentSummary, []);
});

test("untallied slips and tallies for other orders or items do not advance pieces", async () => {
  const result = await summary({ slips: [
    { ...cutting, talliedQuantity: 0 },
    { ...cutting, orderId: "other-order" },
    { ...cutting, orderItemSerialNo: 2 },
  ] });
  assert.deepEqual(result.garmentSummary, [{ garment: "Half Shirt", stage: "Unassigned", quantity: 3 }]);
});

test("cutting history preserves active assignments and final statuses", async () => {
  const result = await summary({ stages: ["Cutting", "Ready", "Delivered"], slips: [{ ...cutting, talliedQuantity: 3 }] });
  assert.deepEqual(result.garmentSummary.map((row) => row.stage), ["Cutting", "Delivered", "Ready"]);
});

test("pieces with stitching already tallied are not reported as awaiting stitching", async () => {
  const result = await summary({ slips: [cutting, { ...cutting, stage: "Stitching" }] });
  assert.deepEqual(result.garmentSummary, [{ garment: "Half Shirt", stage: "Unassigned", quantity: 3 }]);
});

test("normal job-card Cutting completion advances an unassigned piece to Stitching", async () => {
  const result = await summary({ activityLogs: [{
    jobCardId: "card-0", orderId: "mens-order", actionType: "Stage Moved",
    fromStage: "Cutting", toStage: "Unassigned", createdAt: "2026-09-14T10:00:00Z",
  }] });
  assert.deepEqual(result.garmentSummary, [
    { garment: "Half Shirt", stage: "Stitching", quantity: 1 },
    { garment: "Half Shirt", stage: "Unassigned", quantity: 2 },
  ]);
  assert.equal(result.stagePendingSummary[0].pendingPieces, 2);
});
