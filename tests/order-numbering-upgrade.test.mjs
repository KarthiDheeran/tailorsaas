import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createMigratedDatabase, asUser } from "./database-fixture.mjs";

test("upgrade preserves issued orders and initializes each section from its existing maximum", async () => {
  const { db } = await createMigratedDatabase({ through: "0103_enforce_order_rpc_scope.sql" });
  try {
    const tenant = "20000000-0000-0000-0000-000000000001";
    const shop = "20000000-0000-0000-0000-000000000002";
    const user = "20000000-0000-0000-0000-000000000003";
    const customer = "20000000-0000-0000-0000-000000000004";
    await db.query("insert into tenants(id,name) values($1,'Upgrade test')", [tenant]);
    await db.query("insert into shops(id,tenant_id,name) values($1,$2,'Upgrade shop')", [shop, tenant]);
    await db.query("insert into auth.users(id,email) values($1,'upgrade@example.invalid')", [user]);
    await db.query("insert into profiles(id,full_name,role_id,tenant_id,shop_id) values($1,'Upgrade','role-admin',$2,$3)", [user, tenant, shop]);
    await db.query("insert into customers(id,customer_number,name,phone,tenant_id,shop_id) values($1,'UP1','Upgrade','0000000000',$2,$3)", [customer, tenant, shop]);
    const create = (section) => asUser(db, user, (tx) => tx.query(`select create_order_with_items(
      $1,'{"name":"Upgrade"}',current_date,null,current_date+7,'',0,'Cash','In Progress',$2,
      '[{"serialNo":1,"particular":"Test","qty":1,"rate":10,"amount":10}]') as id`, [customer, section]));
    for (const section of ["Chudidar", "Blouse", "Chudidar", "Blouse"]) await create(section);
    const before = (await db.query("select id,order_number,order_sequence,order_section,scan_token,invoice_number from orders order by id")).rows;
    await db.exec(readFileSync(new URL("../supabase/migrations/0104_section_year_order_numbers.sql", import.meta.url), "utf8"));
    const after = (await db.query("select id,order_number,order_sequence,order_section,scan_token,invoice_number from orders order by id")).rows;
    assert.deepEqual(after, before);
    const chudidar = (await create("Chudidar")).rows[0].id;
    const blouse = (await create("Blouse")).rows[0].id;
    assert.equal((await db.query("select order_number from orders where id=$1", [chudidar])).rows[0].order_number, "4");
    assert.equal((await db.query("select order_number from orders where id=$1", [blouse])).rows[0].order_number, "5");
  } finally { await db.close(); }
});
