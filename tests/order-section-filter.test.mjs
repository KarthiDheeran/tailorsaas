import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSourceModule } from "./source-module-fixture.mjs";

test("order details filtering uses the saved section before pagination and preserves all items", async () => {
  const calls = [];
  const query = { then(resolve) { return Promise.resolve({ data: [], count: 12, error: null }).then(resolve); } };
  for (const method of ["select", "eq", "order", "range"]) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  const subject = loadSourceModule("lib/data/orders-db.ts");
  const result = await subject.getOrderListPageRows({ from: () => query }, {
    page: 2, pageSize: 10, sortKey: "orderDate", sortDir: "desc",
    filters: { orderSection: "Chudidar", todayIso: "2026-09-13" },
  });
  const select = calls.find(([method]) => method === "select");
  assert.match(select[1], /order_items!order_items_order_id_fkey \(/);
  assert.doesNotMatch(select[1], /garment_match/);
  assert.deepEqual(select[2], { count: "exact" });
  assert.deepEqual(calls.find(([method]) => method === "eq"), ["eq", "order_section", "Chudidar"]);
  assert.deepEqual(calls.at(-1), ["range", 10, 19]);
  assert.equal(result.totalCount, 12);
});

test("order details options respect the login's permitted order sections", async () => {
  const subject = loadSourceModule("app/(shell)/orders/actions.ts", {
    "@/lib/supabase/server": { createClient: () => ({}) },
    "@/lib/auth/require-server-permission": {
      getServerCallerContext: async () => ({ permissions: ["orders.view"], allowedOrderSections: ["Chudidar", "Blouse"] }),
    },
    "@/lib/permissions": { hasPermission: (permissions, permission) => permissions.includes(permission) },
    "@/lib/catalog": { GARMENT_SECTIONS: ["Men", "Chudidar", "Blouse"] },
  });
  assert.deepEqual(await subject.getOrderSectionFilterOptionsAction(), ["Chudidar", "Blouse"]);
});
