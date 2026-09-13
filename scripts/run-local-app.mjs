// Separate production build pointing only to the local Supabase installation.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const folder = process.argv[2];
if (!folder) throw Error('Usage: node scripts/run-local-app.mjs E:\\TailorLocal\\supabase-local [--check]');
const settings = parseEnv(readFileSync(path.join(folder, '.env'), 'utf8'));
const url = new URL(settings.SUPABASE_PUBLIC_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.protocol !== 'http:') {
  throw Error('This test launcher only accepts a local HTTP Supabase URL.');
}
const publicKey = settings.SUPABASE_PUBLISHABLE_KEY || settings.ANON_KEY;
const secretKey = settings.SUPABASE_SECRET_KEY || settings.SERVICE_ROLE_KEY;
if (!publicKey || !secretKey) throw Error('Local Supabase API keys are missing.');
const response = await fetch(new URL('/auth/v1/settings', url), {
  headers: { apikey: publicKey }, signal: AbortSignal.timeout(15000),
});
if (!response.ok) throw Error(`Local Supabase connection check failed: HTTP ${response.status}`);
console.log(`Local Supabase verified: ${url.origin}`);
console.log('Cloud .env.local is preserved; this process uses local API keys.');
if (process.argv.includes('--check')) process.exit(0);

const root = fileURLToPath(new URL('../', import.meta.url));
const buildOnly = process.argv.includes('--build-only');
const startOnly = process.argv.includes('--start-only');
if (buildOnly && startOnly) throw Error('Choose either --build-only or --start-only.');
const marker = path.join(root, '.next-local', 'local-config.json');
const fingerprint = createHash('sha256').update(`${url.origin}\n${publicKey}`).digest('hex');
const next = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const env = {
  ...process.env,
  NODE_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: url.origin,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
  SUPABASE_SERVICE_ROLE_KEY: secretKey,
  NEXT_DIST_DIR: '.next-local',
  NEXT_TELEMETRY_DISABLED: '1',
};
async function run(args) {
  const child = spawn(process.execPath, [next, ...args], { cwd: root, env, stdio: 'inherit' });
  const stop = () => child.kill('SIGTERM');
  process.once('SIGTERM', stop);
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => code === 0 ? resolve() : reject(Error(`Next.js exited: ${code ?? signal}`)));
    });
  } finally { process.removeListener('SIGTERM', stop); }
}
if (startOnly) {
  if (!existsSync(marker) || !existsSync(path.join(root, '.next-local', 'BUILD_ID'))) {
    throw Error('Local build is missing. Run 06 Build App.bat once before Start Server.bat.');
  }
  if (JSON.parse(readFileSync(marker, 'utf8')).fingerprint !== fingerprint) {
    throw Error('The local URL or public API key changed. Run 06 Build App.bat again.');
  }
} else {
  console.log('Building the local app. The first build may take several minutes...');
  await run(['build']);
  writeFileSync(marker, JSON.stringify({ fingerprint }, null, 2));
}
if (buildOnly) {
  console.log('Build complete. Use Start Server.bat for daily startup.');
  process.exit(0);
}
console.log('Open http://localhost:3102 and sign in with your local admin account.');
console.log('Keep this terminal open while testing. Press Ctrl+C to stop the app.');
await run(['start', '--hostname', '127.0.0.1', '--port', '3102']);
