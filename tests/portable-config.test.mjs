import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSourceModule } from './source-module-fixture.mjs';
const { getSupabasePublicConfig } = loadSourceModule('lib/supabase/public-config.ts');
test('portable configuration overrides build defaults without exposing a service key', () => {
  const names = ['LOCAL_SUPABASE_PUBLIC_URL', 'LOCAL_SUPABASE_PUBLIC_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const saved = names.map((name) => process.env[name]);
  try {
    process.env.LOCAL_SUPABASE_PUBLIC_URL = 'http://192.168.1.25:8000';
    process.env.LOCAL_SUPABASE_PUBLIC_KEY = 'public-test-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'private-test-key';
    assert.deepEqual(getSupabasePublicConfig(), { url: 'http://192.168.1.25:8000', key: 'public-test-key' });
    assert.ok(!JSON.stringify(getSupabasePublicConfig()).includes('private-test-key'));
  } finally { names.forEach((name, i) => saved[i] === undefined ? delete process.env[name] : process.env[name] = saved[i]); }
});
test('browser uses the server-rendered customer configuration', () => {
  const original = globalThis.document;
  try {
    globalThis.document = { getElementById: (id) => id === 'supabase-public-config' ? { textContent: '{"url":"http://192.168.1.30:8000","key":"customer-public-key"}' } : null };
    assert.deepEqual(getSupabasePublicConfig(), { url: 'http://192.168.1.30:8000', key: 'customer-public-key' });
  } finally { if (original === undefined) delete globalThis.document; else globalThis.document = original; }
});
