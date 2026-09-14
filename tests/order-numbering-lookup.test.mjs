import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSourceModule } from "./source-module-fixture.mjs";

function client(rows) {
  const filters = [];
  const query = {
    select() { return this; }, order() { return this; }, limit(value) { assert.equal(value, 2); return this; },
    eq(key, value) { filters.push([key, value]); return this; },
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
  };
  return { filters, from: () => query };
}
test("bare duplicate numbers never silently select a newer order", async () => {
  const subject = loadSourceModule("lib/data/orders-db.ts");
  await assert.rejects(subject.findOrderByOrderNumber(client([{ id: "c", order_number: "1" }, { id: "b", order_number: "1" }]), "1"), /more than one order/);
});
test("new receipt reference includes category and numbering year in lookup", async () => {
  const subject = loadSourceModule("lib/data/orders-db.ts");
  const { orderScanReference } = loadSourceModule("lib/order-numbering.ts");
  for (const orderSection of ["Men", "Chudidar", "Blouse"]) {
    const supabase = client([{ id: "correct", order_number: "1" }]);
    const reference = orderScanReference({ orderNumber: "1", orderSection, orderNumberYear: 2027 });
    assert.equal((await subject.findOrderByOrderNumber(supabase, reference)).id, "correct");
    assert.deepEqual(supabase.filters, [["order_number", "1"], ["order_section", orderSection], ["order_number_year", 2027]]);
  }
});
test("unique legacy number lookup still works", async () => {
  const subject = loadSourceModule("lib/data/orders-db.ts");
  assert.deepEqual(await subject.findOrderByOrderNumber(client([{ id: "legacy", order_number: "7" }]), "7"), { id: "legacy", orderNumber: "7" });
});

test("pending migration preserves order section, urgency filters, and scan tokens in list queries", async () => {
  const subject = loadSourceModule("lib/data/orders-db.ts");
  const requests = [];
  const supabase = { from() {
    const request = { columns: "", filters: [] };
    requests.push(request);
    const query = {
      select(columns) { request.columns = columns; return this; },
      eq(...args) { request.filters.push(args); return this; },
      order() { return this; }, range() { return this; },
      then(resolve) {
        const result = request.columns.includes("order_number_year")
          ? { data: null, count: null, error: { code: "42703", message: "column orders.order_number_year does not exist" } }
          : { data: [{ id: "old", order_number: "2", order_section: "Chudidar", is_urgent: true, scan_token: "receipt-token", order_items: [] }], count: 1, error: null };
        return Promise.resolve(result).then(resolve);
      },
    };
    return query;
  } };
  const result = await subject.getOrderListPageRows(supabase, {
    page: 1, pageSize: 10, sortKey: "orderDate", sortDir: "desc",
    filters: { orderSection: "Chudidar", urgentFilter: "urgent", todayIso: "2026-09-14" },
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].filters, [["order_section", "Chudidar"], ["is_urgent", true]]);
  assert.equal(result.orders[0].orderSection, "Chudidar");
  assert.equal(result.orders[0].scanToken, "receipt-token");
  assert.equal(result.orders[0].isUrgent, true);
});
