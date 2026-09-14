import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, after, test } from "node:test";
import { createMigratedDatabase, asUser } from "./database-fixture.mjs";

let db;
let applied;
const uid = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const A = { tenant: uid(1), shop: uid(2), user: uid(3), customer: uid(4) };
const B = { tenant: uid(11), shop: uid(12), user: uid(13), customer: uid(14) };
const C = { tenant: A.tenant, shop: uid(22), user: uid(23), customer: uid(24) };
const item = { serialNo: 1, particular: "QA shirt", size: "M", qty: 2, rate: 500, addOns: [], addOnsTotal: 0, finalRate: 500, amount: 1000, measurements: {} };

before(async () => {
  ({ db, applied } = await createMigratedDatabase());
  await db.exec(`insert into roles (id,name,type,permissions)
    select 'qa-shop-operator','QA shop operator','custom',array_remove(permissions,'shops.viewAll') from roles where id='role-admin';`);
  for (const identity of [A, B, C]) {
    await db.query("insert into tenants (id,name) values ($1,$2) on conflict do nothing", [identity.tenant, `QA tenant ${identity.tenant}`]);
    await db.query("insert into shops (id,tenant_id,name) values ($1,$2,$3)", [identity.shop, identity.tenant, `QA shop ${identity.shop}`]);
    await db.query("insert into auth.users (id,email) values ($1,$2)", [identity.user, `${identity.user}@example.invalid`]);
    await db.query("insert into profiles (id,full_name,role_id,tenant_id,shop_id,must_change_password) values ($1,'QA operator','qa-shop-operator',$2,$3,false)", [identity.user, identity.tenant, identity.shop]);
    await db.query("insert into customers (id,customer_number,name,phone,tenant_id,shop_id) values ($1,$2,'QA customer',$3,$4,$5)", [identity.customer, `QA-${identity.customer}`, identity.customer, identity.tenant, identity.shop]);
  }
});
beforeEach(async () => {
  await db.exec("truncate orders cascade; truncate shop_order_number_counters; truncate order_number_resets; truncate production_print_layouts;");
});
after(async () => { await db?.close(); });

const run = (identity, sql, params = []) => asUser(db, identity.user, (tx) => tx.query(sql, params));
async function create(identity = A, options = {}) {
  const result = await run(identity, `select create_order_with_items(
    $1, '{"name":"QA customer"}'::jsonb, current_date, null, current_date + 7,
    '', $2, 'Cash', 'In Progress', $4, $3::jsonb) as id`,
  [options.customer ?? identity.customer, options.advance ?? 0, JSON.stringify(options.items ?? [item]), options.section ?? "Men"]);
  return result.rows[0].id;
}
const order = async (id) => (await db.query("select * from orders where id=$1", [id])).rows[0];
const pay = (who, id, amount) => run(who, "select record_payment($1,$2,current_date,'Cash','QA test') as id", [id, amount]);
const adjust = (who, id, type, amount) => run(who, "select record_order_financial_adjustment($1,$2,$3,current_date,$4,'QA test',null) as id", [id, type, amount, type === "Refund" ? "Cash" : null]);
const money = (value) => Number(value);

test("all 116 migration SQL files apply unchanged to a fresh database", () => {
  assert.equal(applied.length, 116);
  assert.equal(applied.at(-1), "0108_global_production_print_layouts.sql");
});

test("counter reconciliation continues each category after its highest existing number", async () => {
  const chudidarIds = [await create(A, { section: "Chudidar" }), await create(A, { section: "Chudidar" })];
  const blouseId = await create(A, { section: "Blouse" });
  const ids = [...chudidarIds, blouseId];
  const before = (await db.query("select id,order_number from orders where id = any($1) order by id", [ids])).rows;
  await db.query("update shop_order_number_counters set last_seq=0 where tenant_id=$1 and shop_id=$2", [A.tenant, A.shop]);
  await db.exec(readFileSync(new URL("../supabase/migrations/0106_reconcile_section_order_number_counters.sql", import.meta.url), "utf8"));
  const sequences = await run(A, "select * from get_order_number_sequences()");
  assert.equal(sequences.rows.find((row) => row.order_section === "Chudidar").next_number, 3);
  assert.equal(sequences.rows.find((row) => row.order_section === "Blouse").next_number, 2);
  assert.deepEqual((await db.query("select id,order_number from orders where id = any($1) order by id", [ids])).rows, before);
});

test("each section allocates 1, 2 independently inside each shop", async () => {
  for (const section of ["Chudidar", "Blouse", "Men"]) {
    assert.equal((await order(await create(A, { section }))).order_number, "1");
    assert.equal((await order(await create(A, { section }))).order_number, "2");
    assert.equal((await order(await create(C, { section }))).order_number, "1");
  }
});

test("yearly reset preserves old orders and restarts only the selected section", async () => {
  const first = await order(await create(A, { section: "Chudidar" }));
  await create(A, { section: "Blouse" });
  const year = first.order_number_year;
  await run(A, "select reset_order_number_sequence('Chudidar',$1,$2)", [year, year + 1]);
  const next = await order(await create(A, { section: "Chudidar" }));
  assert.equal(next.order_number, "1");
  assert.equal(next.order_number_year, year + 1);
  assert.equal((await order(first.id)).order_number_year, year);
  assert.equal((await order(first.id)).order_number, "1");
  assert.notEqual(next.scan_token, first.scan_token);
  assert.equal((await order(await create(A, { section: "Blouse" }))).order_number, "2");
  const audit = (await db.query("select * from order_number_resets")).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].reset_by, A.user);
  await assert.rejects(run(A, "select reset_order_number_sequence('Chudidar',$1,$2)", [year, year + 1]), /changed/);
  await assert.rejects(run(A, "select reset_order_number_sequence('Chudidar',$1,$2)", [year + 1, year + 1]), /later/);
});

test("deleting an old-year order cannot reclaim the new year's number", async () => {
  const old = await order(await create(A, { section: "Chudidar" }));
  await run(A, "select reset_order_number_sequence('Chudidar',$1,$2)", [old.order_number_year, old.order_number_year + 1]);
  await create(A, { section: "Chudidar" });
  await create(A, { section: "Blouse" });
  await run(A, "select delete_untouched_order($1)", [old.id]);
  assert.equal((await order(await create(A, { section: "Chudidar" }))).order_number, "2");
  assert.equal((await order(await create(A, { section: "Blouse" }))).order_number, "2");
});

test("deleting the latest number reclaims only its own category", async () => {
  const chudidar = await create(A, { section: "Chudidar" });
  await create(A, { section: "Blouse" });
  await run(A, "select delete_untouched_order($1)", [chudidar]);
  assert.equal((await order(await create(A, { section: "Chudidar" }))).order_number, "1");
  assert.equal((await order(await create(A, { section: "Blouse" }))).order_number, "2");
});

test("reset cannot affect other shops and obeys section and manager permissions", async () => {
  const first = await order(await create(A, { section: "Chudidar" }));
  await create(C, { section: "Chudidar" });
  await run(A, "select reset_order_number_sequence('Chudidar',$1,$2)", [first.order_number_year, first.order_number_year + 1]);
  assert.equal((await order(await create(C, { section: "Chudidar" }))).order_number, "2");
  await db.query("update profiles set allowed_order_sections=array['Blouse'] where id=$1", [A.user]);
  try {
    const visible = await run(A, "select * from get_order_number_sequences()");
    assert.deepEqual(visible.rows.map((row) => row.order_section), ["Blouse"]);
    await assert.rejects(run(A, "select reset_order_number_sequence('Chudidar',$1,$2)", [first.order_number_year + 1, first.order_number_year + 2]), /inaccessible/);
  } finally { await db.query("update profiles set allowed_order_sections=array['Men','Chudidar','Blouse'] where id=$1", [A.user]); }
  await db.exec("insert into roles(id,name,type,permissions) values('qa-number-viewer','Number viewer','custom',array['settings.view']) on conflict do nothing");
  await db.query("update profiles set role_id='qa-number-viewer' where id=$1", [A.user]);
  try {
    await assert.rejects(run(A, "select reset_order_number_sequence('Blouse',$1,$2)", [first.order_number_year, first.order_number_year + 1]), /manageShop/);
  } finally { await db.query("update profiles set role_id='qa-shop-operator' where id=$1", [A.user]); }
});

test("production print layouts are global, validated, active, and Admin-only", async () => {
  const cells = [{ id: "box-1", fieldCodes: ["chest", "sleeve"], columnSpan: 2, height: "tall", textSize: "small", separator: "new-line", style: "emphasis" }];
  await assert.rejects(run(A, "select save_production_print_layout('Chudidar',null,5,$1::jsonb)", [JSON.stringify(cells)]), /tenant-wide/);
  await db.query("update profiles set role_id='role-admin' where id=$1", [A.user]);
  try {
    await run(A, "select save_production_print_layout('Chudidar',null,5,$1::jsonb)", [JSON.stringify(cells)]);
    await run(A, "select save_production_print_layout('Chudidar',null,6,$1::jsonb)", [JSON.stringify(cells)]);
    const own = await run(A, "select order_section,columns_per_row,cells,is_global,is_active from production_print_layouts");
    assert.equal(own.rows.length, 1);
    assert.equal(own.rows[0].columns_per_row, 6);
    assert.equal(own.rows[0].is_global, true);
    assert.equal(own.rows[0].is_active, true);
    assert.equal((await run(C, "select count(*)::int as count from production_print_layouts")).rows[0].count, 1);
    await run(A, "select set_production_print_layout_active('Chudidar',null,false)");
    assert.equal((await db.query("select is_active from production_print_layouts where tenant_id=$1 and is_global", [A.tenant])).rows[0].is_active, false);
    await assert.rejects(run(A, "select save_production_print_layout('Chudidar',null,3,$1::jsonb)", [JSON.stringify(cells)]), /between 4 and 8/);
    await assert.rejects(run(A, "select save_production_print_layout('Chudidar',null,6,$1::jsonb)", [JSON.stringify([{ ...cells[0], style: "unknown" }])]), /Invalid production print cell/);
    await assert.rejects(run(A, "select save_production_print_layout('Chudidar',null,6,$1::jsonb)", [JSON.stringify([{ ...cells[0], fieldCodes: ["__empty_box__", "chest"] }])]), /Invalid production print cell/);
  } finally { await db.query("update profiles set role_id='qa-shop-operator' where id=$1", [A.user]); }
});

test("Shop Owner maintains one production layout source for every shop", async () => {
  const cells = [{ id: "shared", fieldCodes: ["chest"], columnSpan: 1, height: "normal", textSize: "normal", separator: "new-line", style: "emphasis" }];
  await db.exec("insert into roles(id,name,type,permissions) select 'qa-shop-owner','Shop Owner','custom',permissions from roles where id='role-admin' on conflict do nothing");
  await db.query("update profiles set role_id='qa-shop-owner' where id=$1", [A.user]);
  try {
    await run(A, "select save_production_print_layout('Chudidar',null,5,$1::jsonb)", [JSON.stringify(cells)]);
    assert.equal((await db.query("select count(*)::int as count from production_print_layouts where tenant_id=$1 and order_section='Chudidar' and is_global", [A.tenant])).rows[0].count, 1);
    assert.equal((await run(C, "select count(*)::int as count from production_print_layouts where order_section='Chudidar'")).rows[0].count, 1);
    assert.equal((await run(B, "select count(*)::int as count from production_print_layouts where order_section='Chudidar'")).rows[0].count, 0);
    await run(A, "select delete_production_print_layout('Chudidar',null)");
    assert.equal((await db.query("select count(*)::int as count from production_print_layouts where tenant_id=$1 and order_section='Chudidar'", [A.tenant])).rows[0].count, 0);
  } finally { await db.query("update profiles set role_id='qa-shop-operator' where id=$1", [A.user]); }
});

test("order creation records advance, item totals, and one job card per piece", async () => {
  const id = await create(A, { advance: 200 });
  await run(A, "select sync_job_cards_for_order($1)", [id]);
  const saved = await order(id);
  assert.equal(money(saved.total_amount), 1000);
  assert.equal(money(saved.advance_paid), 200);
  assert.equal(money(saved.balance), 800);
  assert.equal((await db.query("select count(*)::int as count from job_cards where order_id=$1", [id])).rows[0].count, 2);
});

test("partial and final payments update the ledger and balance", async () => {
  const id = await create(A, { advance: 200 });
  const partial = (await pay(A, id, 300)).rows[0].id;
  assert.equal((await db.query("select payment_type from payments where id=$1", [partial])).rows[0].payment_type, "Partial");
  assert.equal(money((await order(id)).balance), 500);
  const final = (await pay(A, id, 500)).rows[0].id;
  assert.equal((await db.query("select payment_type from payments where id=$1", [final])).rows[0].payment_type, "Final");
  assert.equal(money((await order(id)).balance), 0);
  assert.equal((await order(id)).payment_status, "Paid");
});

test("invalid payment amounts and future dates leave the balance unchanged", async () => {
  const id = await create();
  for (const amount of [-1, 0, 1001]) await assert.rejects(pay(A, id, amount));
  await assert.rejects(run(A, "select record_payment($1,100,current_date+1,'Cash',null)", [id]), /future/);
  assert.equal(money((await order(id)).balance), 1000);
});

test("voiding a payment restores balance and repeated voiding fails", async () => {
  const id = await create();
  const payment = (await pay(A, id, 200)).rows[0].id;
  await run(A, "select void_payment($1,'QA correction')", [payment]);
  assert.equal(money((await order(id)).balance), 1000);
  await assert.rejects(run(A, "select void_payment($1,'QA repeated')", [payment]), /already voided/);
});

test("discounts, extra charges, and refunds reconcile order totals", async () => {
  const id = await create(A, { advance: 200 });
  await adjust(A, id, "Discount", 100);
  await adjust(A, id, "Extra Charge", 50);
  await adjust(A, id, "Refund", 50);
  const saved = await order(id);
  assert.equal(money(saved.total_amount), 950);
  assert.equal(money(saved.advance_paid), 150);
  assert.equal(money(saved.balance), 800);
  await assert.rejects(adjust(A, id, "Refund", 151), /exceeds paid/);
});

test("a failed order item insertion rolls back the order and numbering counter", async () => {
  await assert.rejects(create(A, { items: [{ ...item, qty: 0 }] }));
  const id = await create();
  assert.equal((await order(id)).order_number, "1");
  assert.equal((await db.query("select count(*)::int as count from orders")).rows[0].count, 1);
});

test("real-schema deletion reuses only the last shop order number", async () => {
  const older = await create();
  const latest = await create();
  await run(A, "select delete_untouched_order($1)", [older]);
  await run(A, "select delete_untouched_order($1)", [latest]);
  assert.equal((await order(await create())).order_number, "2");
});

test("deletion rejects orders with a payment even after that payment is voided", async () => {
  const id = await create();
  const payment = (await pay(A, id, 100)).rows[0].id;
  await run(A, "select void_payment($1,'QA correction')", [payment]);
  await assert.rejects(run(A, "select delete_untouched_order($1)", [id]), /financial activity/);
});

test("delivery requires Ready status and enforces remaining piece quantities", async () => {
  const id = await create();
  const piece = (await db.query("select id from order_items where order_id=$1", [id])).rows[0].id;
  const deliver = (qty) => run(A, "select deliver_order_items($1,$2::jsonb,0,'Cash',null)", [id, JSON.stringify([{ orderItemId: piece, quantity: qty }])]);
  await assert.rejects(deliver(1), /only Ready/);
  await run(A, "select mark_order_ready_with_bin($1,'QA-BIN')", [id]);
  await deliver(1);
  assert.equal((await order(id)).status, "Ready");
  await assert.rejects(deliver(2), /exceeds pending/);
  await deliver(1);
  assert.equal((await order(id)).status, "Delivered");
});

test("RLS isolates orders by shop and shares customers only within their tenant", async () => {
  const a = await create(A);
  await create(B);
  await create(C);
  assert.deepEqual((await run(A, "select id from orders")).rows.map((row) => row.id), [a]);
  assert.deepEqual((await run(A, "select id from customers order by id")).rows.map((row) => row.id), [A.customer, C.customer]);
});

test("payment and deletion RPCs reject another tenant's order", async () => {
  const id = await create(B);
  await assert.rejects(pay(A, id, 100), /permission denied/);
  await assert.rejects(run(A, "select delete_untouched_order($1)", [id]), /access denied/);
});

async function inventoryOrder(stock) {
  const garment = (await db.query("insert into catalog_garment_types (name,base_price,order_section,shortcut_code) select 'QA inventory shirt',500,'Men',coalesce(max(shortcut_code),0)+1 from catalog_garment_types returning id")).rows[0].id;
  const inventory = (await db.query("insert into inventory_items (name,item_type,unit,quantity_on_hand) values ('QA fabric','Fabric','meter',$1) returning id", [stock])).rows[0].id;
  await db.query("insert into inventory_consumption_rules (garment_type_id,inventory_item_id,calculation_type,fixed_quantity) values ($1,$2,'Fixed',1.5)", [garment, inventory]);
  const id = await create(A, { items: [{ ...item, garmentTypeId: garment }] });
  await run(A, "select mark_order_ready_with_bin($1,'QA-BIN')", [id]);
  const piece = (await db.query("select id from order_items where order_id=$1", [id])).rows[0].id;
  return { id, piece, inventory };
}

test("partial deliveries consume inventory once per delivered piece", async () => {
  const { id, piece, inventory } = await inventoryOrder(10);
  for (const expected of [8.5, 7]) {
    await run(A, "select deliver_order_items($1,$2::jsonb,0,'Cash',null)", [id, JSON.stringify([{ orderItemId: piece, quantity: 1 }])]);
    assert.equal(money((await db.query("select quantity_on_hand from inventory_items where id=$1", [inventory])).rows[0].quantity_on_hand), expected);
  }
  assert.equal((await db.query("select count(*)::int as count from inventory_delivery_consumptions where order_id=$1", [id])).rows[0].count, 2);
});

test("insufficient inventory rolls back delivery and leaves stock untouched", async () => {
  const { id, piece, inventory } = await inventoryOrder(1);
  await assert.rejects(run(A, "select deliver_order_items($1,$2::jsonb,0,'Cash',null)", [id, JSON.stringify([{ orderItemId: piece, quantity: 1 }])]), /Insufficient stock/);
  assert.equal((await db.query("select delivered_qty from order_items where id=$1", [piece])).rows[0].delivered_qty, 0);
  assert.equal(money((await db.query("select quantity_on_hand from inventory_items where id=$1", [inventory])).rows[0].quantity_on_hand), 1);
});

test("duplicate customer name and phone is rejected within a tenant", async () => {
  await assert.rejects(db.query("insert into customers (customer_number,name,phone,tenant_id,shop_id) values ('QA-duplicate',' qa CUSTOMER ',$1,$2,$3)", [A.customer, A.tenant, A.shop]), /duplicate key/);
});

// These are required invariants. Failures are genuine audit findings, not
// expected-success tests or tests skipped to obtain a green result.
test("SECURITY: financial adjustments reject another tenant's order", async () => {
  const id = await create(B);
  await assert.rejects(adjust(A, id, "Discount", 100), /permission denied|access denied/);
});

test("SECURITY: voiding an adjustment rejects another tenant's order", async () => {
  const id = await create(B);
  const adjustment = (await adjust(B, id, "Discount", 100)).rows[0].id;
  await assert.rejects(run(A, "select void_order_financial_adjustment($1,'QA correction')", [adjustment]), /permission denied|access denied/);
});

test("SECURITY: creating an order rejects another tenant's customer", async () => {
  await assert.rejects(create(A, { customer: B.customer }), /permission denied|access denied|customer/);
});

test("SECURITY: synchronizing job cards rejects another tenant's order", async () => {
  const id = await create(B);
  await assert.rejects(run(A, "select sync_job_cards_for_order($1)", [id]), /permission denied|access denied/);
});

test("scoped RPCs reject another shop while tenant-wide customers remain usable", async () => {
  const id = await create(C);
  const adjustment = (await adjust(C, id, "Discount", 50)).rows[0].id;
  await assert.rejects(adjust(A, id, "Discount", 10), /access denied/);
  await assert.rejects(run(A, "select void_order_financial_adjustment($1,'QA')", [adjustment]), /access denied/);
  await assert.rejects(run(A, "select sync_job_cards_for_order($1)", [id]), /access denied/);
  assert.equal(money((await order(id)).total_amount), 950);
  await run(C, "select void_order_financial_adjustment($1,'QA')", [adjustment]);
  assert.equal(money((await order(id)).total_amount), 1000);
  const sharedCustomerOrder = await create(A, { customer: C.customer });
  assert.equal((await order(sharedCustomerOrder)).customer_id, C.customer);
});
