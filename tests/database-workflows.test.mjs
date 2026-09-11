import assert from "node:assert/strict";
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
  await db.exec("truncate orders cascade; truncate shop_order_number_counters;");
});
after(async () => { await db?.close(); });

const run = (identity, sql, params = []) => asUser(db, identity.user, (tx) => tx.query(sql, params));
async function create(identity = A, options = {}) {
  const result = await run(identity, `select create_order_with_items(
    $1, '{"name":"QA customer"}'::jsonb, current_date, null, current_date + 7,
    '', $2, 'Cash', 'In Progress', 'Men', $3::jsonb) as id`,
  [options.customer ?? identity.customer, options.advance ?? 0, JSON.stringify(options.items ?? [item])]);
  return result.rows[0].id;
}
const order = async (id) => (await db.query("select * from orders where id=$1", [id])).rows[0];
const pay = (who, id, amount) => run(who, "select record_payment($1,$2,current_date,'Cash','QA test') as id", [id, amount]);
const adjust = (who, id, type, amount) => run(who, "select record_order_financial_adjustment($1,$2,$3,current_date,$4,'QA test',null) as id", [id, type, amount, type === "Refund" ? "Cash" : null]);
const money = (value) => Number(value);

test("all 111 migration SQL files apply unchanged to a fresh database", () => {
  assert.equal(applied.length, 111);
  assert.equal(applied.at(-1), "0103_enforce_order_rpc_scope.sql");
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
