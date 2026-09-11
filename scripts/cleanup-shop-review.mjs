import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
process.loadEnvFile('.env.local'); process.loadEnvFile('.env.test.local');
const report = JSON.parse(readFileSync('test-results/shop-workflows.json', 'utf8'));
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const check = async (query) => { const r = await query; if (r.error) throw Error(r.error.message); return r.data; };
await check(client.auth.signInWithPassword({ email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD }));
for (const shop of report.shops) {
  if (!shop.paymentId) continue;
  const payment = await check(client.from('payments').select('id,order_id,voided,notes,amount').eq('id', shop.paymentId).single());
  if (!shop.orders.some((o) => o.id === payment.order_id) || !payment.notes?.startsWith(report.tag) || Number(payment.amount) !== 1) throw Error('QA ownership check failed');
  if (!payment.voided) await check(client.rpc('void_payment', { p_payment_id: payment.id, p_reason: `${report.tag} QA cleanup by authorized admin` }));
  const verified = await check(client.from('payments').select('voided').eq('id', payment.id).single());
  if (!verified.voided) throw Error('Void not confirmed');
  shop.cleanup.push('QA payment voided and verified using supplied admin account');
  const order = await check(client.from('orders').select('balance,status').eq('id', payment.order_id).single());
  if (Number(order.balance) !== 1 || order.status !== 'Cancelled') throw Error('Cancelled QA order did not reconcile');
  shop.checks.push('Admin void restores balance; QA order remains cancelled');
  writeFileSync('test-results/shop-workflows.json', JSON.stringify(report, null, 2));
  console.log(`${shop.shop}: QA payment voided; cancelled order verified`);
}
await client.auth.signOut({ scope: 'local' });
