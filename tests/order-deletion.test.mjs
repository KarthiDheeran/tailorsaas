import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Real PostgreSQL execution, using disposable tables and auth stubs. No network
// or shop data is used. Production auth policies and multi-session locking need
// a separate staging integration test.
const db = new PGlite();
const tenant = "00000000-0000-0000-0000-000000000001";
const shop = "00000000-0000-0000-0000-000000000002";
const older = "00000000-0000-0000-0000-000000000100";
const latest = "00000000-0000-0000-0000-000000000101";
const source = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

before(async () => {
  await db.exec(`
    create role authenticated;
    create role service_role;
    create table orders (
      id uuid primary key, tenant_id uuid not null, shop_id uuid not null,
      order_section text default 'Men', order_sequence integer,
      unique (tenant_id, shop_id, order_sequence)
    );
    create table shop_order_number_counters (
      tenant_id uuid, shop_id uuid, last_seq integer check (last_seq >= 0),
      updated_at timestamptz default now(), primary key (tenant_id, shop_id)
    );
    create table job_cards (
      id uuid primary key, order_id uuid references orders on delete cascade,
      current_stage text default 'Unassigned', assigned_staff_id uuid,
      started_date date, completed_date date, cancelled boolean default false
    );
    create table payments (order_id uuid references orders on delete restrict);
    create table order_financial_adjustments (order_id uuid references orders on delete restrict);
    create table job_card_stage_slips (order_id uuid references orders on delete cascade);
    create table staff_work_earnings (order_id uuid references orders on delete cascade);
    create function auth_has_permission(text) returns boolean language sql as
      $$ select current_setting('test.allow', true) = 'yes' $$;
    create function auth_user_tenant_id() returns uuid language sql as $$ select '${tenant}'::uuid $$;
    create function auth_user_shop_id() returns uuid language sql as $$ select '${shop}'::uuid $$;
    create function auth_can_access_scope(uuid, uuid, text) returns boolean language sql as
      $$ select $1 = '${tenant}'::uuid and $2 = '${shop}'::uuid and $3 = 'Men' $$;
  `);
  const numbering = source("0066_tenants_shops_and_shop_order_numbers.sql");
  const start = numbering.indexOf("create or replace function public.generate_order_number(");
  const end = numbering.indexOf("create or replace function public.peek_next_order_number", start);
  assert.ok(start >= 0 && end > start);
  await db.exec(numbering.slice(start, end));
  await db.exec(source("0102_reclaim_latest_deleted_order_number.sql"));
});

beforeEach(async () => {
  await db.exec(`
    truncate orders cascade;
    truncate shop_order_number_counters;
    set test.allow = 'yes';
    insert into orders (id, tenant_id, shop_id, order_sequence) values
      ('${older}', '${tenant}', '${shop}', 100), ('${latest}', '${tenant}', '${shop}', 101);
    insert into shop_order_number_counters (tenant_id, shop_id, last_seq) values ('${tenant}', '${shop}', 101);
  `);
});
after(async () => { await db.close(); });

const remove = (id) => db.query("select delete_untouched_order($1)", [id]);
const next = async () => (await db.query("select generate_order_number('Men') as number")).rows[0].number;
const counter = async () => (await db.query("select last_seq from shop_order_number_counters where shop_id=$1", [shop])).rows[0].last_seq;

test("deleting the last issued order reuses its number", async () => {
  await remove(latest);
  assert.equal(await counter(), 100);
  assert.equal(await next(), "101");
  assert.equal((await db.query("select order_sequence from orders")).rows[0].order_sequence, 100);
});

test("deleting an older order preserves the gap", async () => {
  await remove(older);
  assert.equal(await counter(), 101);
  assert.equal(await next(), "102");
});

test("deletion never jumps back across an older gap", async () => {
  await remove(older);
  await remove(latest);
  assert.equal(await counter(), 100);
  assert.equal(await next(), "101");
});

test("a later issued number prevents reclaiming the earlier one", async () => {
  assert.equal(await next(), "102");
  await remove(latest);
  assert.equal(await next(), "103");
});

test("payment, adjustment, work slip, and earnings activity block deletion without changing the counter", async () => {
  for (const table of ["payments", "order_financial_adjustments", "job_card_stage_slips", "staff_work_earnings"]) {
    await db.query(`insert into ${table} (order_id) values ($1)`, [latest]);
    await assert.rejects(remove(latest), /cannot be deleted/);
    assert.equal(await counter(), 101);
    assert.equal((await db.query("select count(*)::int as count from orders")).rows[0].count, 2);
    await db.exec(`truncate ${table}`);
  }
});

test("untouched job cards cascade, but production updates prevent deletion", async () => {
  await db.query("insert into job_cards (id, order_id, current_stage) values ($1, $1, 'Cutting')", [latest]);
  await assert.rejects(remove(latest), /started production/);
  assert.equal(await counter(), 101);
  await db.exec("update job_cards set current_stage='Unassigned'");
  await remove(latest);
  assert.equal((await db.query("select count(*)::int as count from job_cards")).rows[0].count, 0);
  assert.equal(await counter(), 100);
});

test("unauthorized and out-of-shop deletions are rejected", async () => {
  await db.exec("set test.allow = 'no'");
  await assert.rejects(remove(latest), /permission denied/);
  await db.exec("set test.allow = 'yes'");
  await db.query("update orders set shop_id = '00000000-0000-0000-0000-000000000003' where id=$1", [latest]);
  await assert.rejects(remove(latest), /access denied/);
  assert.equal(await counter(), 101);
});

test("transaction rollback restores both order and sequence", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    await tx.query("select delete_untouched_order($1)", [latest]);
    throw new Error("rollback test");
  }), /rollback test/);
  assert.equal(await counter(), 101);
  assert.equal((await db.query("select count(*)::int as count from orders")).rows[0].count, 2);
});

test("repeated deletion fails without decrementing the counter twice", async () => {
  await remove(latest);
  await assert.rejects(remove(latest), /not found/);
  assert.equal(await counter(), 100);
});
