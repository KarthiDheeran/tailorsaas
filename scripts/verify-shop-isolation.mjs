import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.local'); process.loadEnvFile('.env.test.local');
const workflow = JSON.parse(readFileSync('test-results/shop-workflows.json', 'utf8'));
const results = [];
const check = async (q) => { const r = await q; if (r.error) throw Error(r.error.message); return r.data; };
for (const [index, key] of ['MENS', 'WOMENS'].entries()) {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  try {
    await check(client.auth.signInWithPassword({ email: process.env[`E2E_${key}_EMAIL`], password: process.env[`E2E_${key}_PASSWORD`] }));
    const own = workflow.shops[index].orders.find((order) => !order.deleted);
    const other = workflow.shops[1 - index].orders.find((order) => !order.deleted);
    const visible = await check(client.from('orders').select('id,status,balance').in('id', [own.id, other.id]));
    assert.deepEqual(visible.map((order) => order.id), [own.id]);
    assert.equal(visible[0].status, 'Cancelled');
    assert.equal(Number(visible[0].balance), 1);
    const payment = await check(client.from('payments').select('voided').eq('id', workflow.shops[index].paymentId).single());
    assert.equal(payment.voided, true);
    results.push({ shop: key, ownCancelledOrderVisible: true, otherShopOrderHidden: true, testPaymentVoided: true });
  } finally { await client.auth.signOut({ scope: 'local' }); }
}
writeFileSync('test-results/shop-isolation.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
