import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const cloud = parseEnv(readFileSync('.env.local', 'utf8'));
const local = parseEnv(readFileSync('E:/TailorLocal/supabase-local/.env', 'utf8'));
for (const [label, url, key] of [
  ['cloud', cloud.NEXT_PUBLIC_SUPABASE_URL, cloud.SUPABASE_SERVICE_ROLE_KEY],
  ['local', local.SUPABASE_PUBLIC_URL, local.SUPABASE_SECRET_KEY || local.SERVICE_ROLE_KEY],
]) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.from('catalog_garment_types').select('name,shortcut_code,order_section,is_active,base_price').order('name');
  if (error) throw Error(`${label}: ${error.message}`);
  console.log(JSON.stringify({ source: label, garments: data }));
}
