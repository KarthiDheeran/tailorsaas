// Uses normal authenticated clients. Retains cancelled QA orders and voided financial audit entries.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
process.loadEnvFile('.env.local');
process.loadEnvFile('.env.test.local');
if (!process.argv.includes('--run')) throw Error('Use --run to create labelled QA records.');
const tag = `QA-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
const report = { tag, environment: 'Configured backend; normal authenticated RPCs, no migration deployment', shops: [] };
const save = () => writeFileSync('test-results/shop-workflows.json', JSON.stringify(report, null, 2));
const check = async (query) => { const r = await query; if (r.error) throw Error(r.error.message); return r.data; };
for (const [key, shopName, section, phone] of [['MENS', 'NewLook Mens', 'Men', '0000000101'], ['WOMENS', 'NewLook Womens', 'Chudidar', '0000000102']]) {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const row = { shop: shopName, checks: [], orders: [], cleanup: [], errors: [] };
  report.shops.push(row); save();
  let pendingPayment, pendingAdjustment;
  try {
    const auth = await check(client.auth.signInWithPassword({ email: process.env[`E2E_${key}_EMAIL`], password: process.env[`E2E_${key}_PASSWORD`] }));
    const profile = await check(client.from('profiles').select('tenant_id,shop_id,role_id').eq('id', auth.user.id).single());
    const role = await check(client.from('roles').select('permissions').eq('id', profile.role_id).single());
    const shop = await check(client.from('shops').select('name').eq('id', profile.shop_id).single());
    assert.equal(shop.name, shopName);
    const customer = await check(client.from('customers').insert({ customer_number: `${tag}-${key}`, name: `${tag} ${key} TEST ONLY`, phone, address: 'QA test - no delivery', area: 'QA', notes: 'Automated QA; no customer contact', tenant_id: profile.tenant_id, shop_id: profile.shop_id }).select('id').single());
    row.customerId = customer.id; save();
    const today = new Date().toISOString().slice(0, 10);
    const createOrder = async (purpose) => {
      const id = await check(client.rpc('create_order_with_items', {
        p_customer_id: customer.id, p_customer_snapshot: { name: `${tag} ${key} TEST ONLY`, phone },
        p_order_date: today, p_trial_date: null, p_delivery_date: today, p_delivery_promise_note: 'QA ONLY - DO NOT PRODUCE',
        p_advance_paid: 0, p_payment_mode: 'Cash', p_status: 'In Progress', p_order_section: section,
        p_items: [{ serialNo: 1, particular: 'QA TEST ONLY', size: 'QA', qty: 1, rate: 1, addOns: [], addOnsTotal: 0, finalRate: 1, amount: 1, measurements: {} }],
      }));
      const entry = { id, purpose, deleted: false, cancelled: false }; row.orders.push(entry); save();
      const order = await check(client.from('orders').select('id,shop_id,order_number,balance').eq('id', id).single());
      assert.equal(order.shop_id, profile.shop_id); entry.number = order.order_number; save();
      return entry;
    };
    const untouched = await createOrder('untouched deletion');
    await check(client.rpc('sync_job_cards_for_order', { p_order_id: untouched.id }));
    assert.equal((await check(client.from('job_cards').select('id').eq('order_id', untouched.id))).length, 1);
    await check(client.rpc('delete_untouched_order', { p_order_id: untouched.id }));
    assert.equal((await check(client.from('orders').select('id').eq('id', untouched.id))).length, 0);
    untouched.deleted = true; row.checks.push('Create/read/sync/delete untouched order'); save();
    if (!role.permissions.includes('orders.voidPayment')) {
      row.checks.push('Financial mutation skipped: this role cannot void its QA payment');
      continue;
    }
    const ledger = await createOrder('financial audit');
    pendingPayment = await check(client.rpc('record_payment', { p_order_id: ledger.id, p_amount: 1, p_payment_date: today, p_payment_mode: 'Cash', p_notes: `${tag} QA ONLY` }));
    row.paymentId = pendingPayment; save();
    const readOrder = () => check(client.from('orders').select('balance,total_amount').eq('id', ledger.id).single());
    assert.equal(Number((await readOrder()).balance), 0);
    row.checks.push('Record payment and verify zero balance');
    await check(client.rpc('void_payment', { p_payment_id: pendingPayment, p_reason: `${tag} QA cleanup` }));
    pendingPayment = null; row.cleanup.push('QA payment voided'); save();
    assert.equal(Number((await readOrder()).balance), 1);
    row.checks.push('Void payment restores balance');
    pendingAdjustment = await check(client.rpc('record_order_financial_adjustment', { p_order_id: ledger.id, p_adjustment_type: 'Discount', p_amount: 0.1, p_adjustment_date: today, p_payment_mode: null, p_reason: `${tag} QA ONLY`, p_notes: null }));
    row.adjustmentId = pendingAdjustment; save();
    assert.equal(Number((await readOrder()).total_amount), 0.9);
    await check(client.rpc('void_order_financial_adjustment', { p_adjustment_id: pendingAdjustment, p_reason: `${tag} QA cleanup` }));
    pendingAdjustment = null; row.cleanup.push('QA discount voided'); save();
    assert.equal(Number((await readOrder()).total_amount), 1);
    row.checks.push('Authorized adjustment and void reconcile total');
  } catch (e) { row.errors.push(e.message); process.exitCode = 1; }
  finally {
    for (const [id, rpc, args] of [
      [pendingPayment, 'void_payment', { p_payment_id: pendingPayment, p_reason: `${tag} QA cleanup` }],
      [pendingAdjustment, 'void_order_financial_adjustment', { p_adjustment_id: pendingAdjustment, p_reason: `${tag} QA cleanup` }],
    ]) if (id) { try { await check(client.rpc(rpc, args)); row.cleanup.push(`${rpc} completed after failure`); } catch (e) { row.errors.push(`Cleanup: ${e.message}`); process.exitCode = 1; } }
    for (const order of row.orders.filter((o) => !o.deleted)) {
      try {
        const saved = await check(client.from('orders').update({ status: 'Cancelled' }).eq('id', order.id).select('status').single());
        assert.equal(saved.status, 'Cancelled'); order.cancelled = true;
        row.cleanup.push(`Cancelled QA order ${order.id}; audit retained`);
      } catch (e) { row.errors.push(`Cleanup: ${e.message}`); process.exitCode = 1; }
    }
    save(); await client.auth.signOut({ scope: 'local' }); console.log(JSON.stringify(row));
  }
}
