import { mkdirSync, cpSync, copyFileSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const run = (exe, args, options = {}) => {
  const result = spawnSync(exe, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw result.error ?? Error(`Command failed: ${path.basename(exe)} (${result.status})`);
};
// Never bake the developer's database address or credentials into a customer build.
run(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { env: {
  ...process.env, NODE_ENV: 'production', TAILOR_PORTABLE_BUILD: '1', NEXT_DIST_DIR: '.next-portable', NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:59999', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'configured-at-customer-startup',
  LOCAL_SUPABASE_PUBLIC_URL: '', LOCAL_SUPABASE_PUBLIC_KEY: '', SUPABASE_SERVICE_ROLE_KEY: 'configured-at-customer-startup',
} });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const release = path.join(root, 'release');
const folder = path.join(release, `NewLook-Local-${stamp}`);
mkdirSync(folder, { recursive: true });
const standalone = path.join(root, '.next-portable', 'standalone');
if (!existsSync(path.join(standalone, 'server.js'))) throw Error('Standalone server was not generated at the expected location.');
const filter = (source) => {
  const name = path.basename(source);
  return name !== '.git' && !name.startsWith('.env') && !source.endsWith('.map') && !source.endsWith('.tsbuildinfo');
};
cpSync(standalone, path.join(folder, 'app'), { recursive: true, filter });
cpSync(path.join(root, '.next-portable', 'static'), path.join(folder, 'app', '.next-portable', 'static'), { recursive: true, filter });
cpSync(path.join(root, 'public'), path.join(folder, 'app', 'public'), { recursive: true, filter });
copyFileSync(path.join(root, 'scripts', 'customer-server.mjs'), path.join(folder, 'customer-server.mjs'));
mkdirSync(path.join(folder, 'setup'), { recursive: true });
mkdirSync(path.join(folder, 'scripts'), { recursive: true });
for (const name of ['setup-local-database.mjs', 'local-windows-setup.mjs']) copyFileSync(path.join(root, 'scripts', name), path.join(folder, 'scripts', name));
cpSync(path.join(root, 'supabase', 'migrations'), path.join(folder, 'supabase', 'migrations'), { recursive: true });
for (const name of ['01 Check Requirements.bat', '02 Prepare Supabase.bat', '03 Start Database.bat', '04 Install Schema.bat', '05 Create Admin.bat', 'create-local-admin.sql', 'settings.cmd']) {
  copyFileSync(path.join(root, 'local-setup', name), path.join(folder, 'setup', name));
}
writeFileSync(path.join(folder, 'customer-config.json'), JSON.stringify({ supabaseDirectory: 'E:\\TailorLocal\\supabase-local', supabasePublicUrl: 'http://localhost:8000', bindAddress: '127.0.0.1', port: 3102 }, null, 2));
writeFileSync(path.join(folder, 'Start Server.bat'), '@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nnode customer-server.mjs\r\nif errorlevel 1 echo Startup failed. Read the error above.\r\npause\r\n');
writeFileSync(path.join(folder, 'README.txt'), `NEWLOOK LOCAL APPLICATION\n\nThis is a compiled Windows/Node.js package. No app build or npm install is required at the customer site.\n\nTECHNICIAN: Install Node.js 22+, Git for Windows and Docker Desktop/WSL 2. Run setup steps 01-05 once. Configure customer-config.json with the Supabase folder and browser-reachable API URL. The customer creates their own local secrets; no developer passwords are shipped.\n\nDAILY: Run Start Server.bat and open http://localhost:3102. Keep the window open. Ctrl+C stops the app; Docker data remains.\n\nThe default is single-PC testing. For LAN use, set bindAddress to 0.0.0.0 and supabasePublicUrl to the server's LAN address, and configure local HTTPS/firewall/auth callback URLs with the technician.\n\nCatalog import, shop accounts and backup configuration are separate one-time work. This archive does not contain existing customer data, Supabase images, or installed prerequisites. The one-time setup needs internet to obtain them.\n\nKeep the database and storage folders separate when updating the application. Do not reset database volumes. Compiled server JavaScript and runtime dependencies are present, but original app TS/TSX, Git history, tests and development env files are excluded.\n`);
// Validate explicit private-file exclusions before creating a distributable archive.
function audit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.env') || entry.name === '.git' || entry.name.endsWith('.map')) throw Error(`Private/source-map artifact detected: ${entry.name}`);
    if (entry.isDirectory()) audit(path.join(dir, entry.name));
  }
}
audit(folder);
const zip = `${folder}.zip`;
// Absolute paths are passed as environment values, never interpolated as shell code.
run('powershell.exe', ['-NoProfile', '-Command', 'Compress-Archive -LiteralPath $env:TAILOR_PACKAGE_SOURCE -DestinationPath $env:TAILOR_PACKAGE_ZIP -CompressionLevel Optimal'],
  { env: { ...process.env, TAILOR_PACKAGE_SOURCE: folder, TAILOR_PACKAGE_ZIP: zip } });
writeFileSync(path.join(release, 'LATEST.txt'), `${zip}\n`);
console.log(`\nPACKAGE READY: ${zip}\nCopy this ZIP to the customer's Windows computer.`);
