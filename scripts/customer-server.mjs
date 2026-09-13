import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('./', import.meta.url));
const config = JSON.parse(readFileSync(path.join(root, 'customer-config.json'), 'utf8'));
if (process.env.TAILOR_PORT) config.port = Number(process.env.TAILOR_PORT);
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw Error('Invalid server port.');
const folder = path.resolve(root, config.supabaseDirectory);
const vars = parseEnv(readFileSync(path.join(folder, '.env'), 'utf8'));
const url = config.supabasePublicUrl;
if (!url || !vars.SUPABASE_SECRET_KEY && !vars.SERVICE_ROLE_KEY) throw Error('Technician must configure local Supabase before startup.');
const docker = [path.join(process.env.LOCALAPPDATA ?? '', 'Programs/DockerDesktop/resources/bin/docker.exe'),
  path.join(process.env.ProgramFiles ?? 'C:/Program Files', 'Docker/Docker/resources/bin/docker.exe')].find(existsSync) ?? 'docker';
if (!process.argv.includes('--app-only')) {
  if (spawnSync(docker, ['--context', 'desktop-linux', 'info'], { stdio: 'ignore' }).status !== 0) {
    if (spawnSync(docker, ['desktop', 'start'], { stdio: 'inherit' }).status !== 0) throw Error('Open Docker Desktop and retry.');
  }
  const result = spawnSync(docker, ['--context', 'desktop-linux', 'compose', 'up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '180'], { cwd: folder, stdio: 'inherit' });
  if (result.status !== 0) throw Error('Local database startup failed.');
}
const env = { ...process.env, NODE_ENV: 'production', HOSTNAME: config.bindAddress || '127.0.0.1', PORT: String(config.port || 3102),
  LOCAL_SUPABASE_PUBLIC_URL: url, LOCAL_SUPABASE_PUBLIC_KEY: vars.SUPABASE_PUBLISHABLE_KEY || vars.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: vars.SUPABASE_SECRET_KEY || vars.SERVICE_ROLE_KEY, NEXT_TELEMETRY_DISABLED: '1' };
const child = spawn(process.execPath, [path.join(root, 'app', 'server.js')], { cwd: path.join(root, 'app'), env, stdio: 'inherit' });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
console.log(`Open http://localhost:${env.PORT}. Keep this window open. Ctrl+C stops the app.`);
