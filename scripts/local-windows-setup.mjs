import { existsSync, mkdirSync, cpSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const [action, inputFolder] = process.argv.slice(2);
if (!inputFolder || !['check', 'prepare', 'database', 'start', 'status'].includes(action)) {
  throw Error('Usage: node scripts/local-windows-setup.mjs check|prepare|database|start|status <Supabase folder> [--dry-run]');
}
const folder = path.resolve(inputFolder);
const root = fileURLToPath(new URL('../', import.meta.url));
const docker = [
  path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe'),
  path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'),
].find(existsSync) ?? 'docker';
const bash = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe');
const compose = (...args) => ['--context', 'desktop-linux', 'compose', '--project-directory', folder, ...args];
function run(exe, args, options = {}) {
  const result = spawnSync(exe, args, { cwd: options.cwd ?? folder, env: options.env ?? process.env,
    stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw Error(`${path.basename(exe)} ${args[0] ?? ''} failed. ${result.error?.message ?? 'Check the preceding message.'}`);
  }
}
function requireConfig() {
  if (!existsSync(path.join(folder, 'docker-compose.yml')) || !existsSync(path.join(folder, '.env'))) {
    throw Error('Supabase configuration is missing. Run 02 Prepare Supabase.bat first.');
  }
  if (existsSync(path.join(folder, '.tailor-secrets-pending'))) {
    throw Error('Secret generation was interrupted. A technician must finish configuration before startup.');
  }
  const configured = parseEnv(readFileSync(path.join(folder, '.env'), 'utf8'));
  const samplePath = path.join(folder, '.env.example');
  const example = existsSync(samplePath) ? parseEnv(readFileSync(samplePath, 'utf8')) : {};
  for (const key of ['POSTGRES_PASSWORD', 'JWT_SECRET', 'DASHBOARD_PASSWORD']) {
    if (!configured[key] || configured[key] === example[key]) {
      throw Error(`Local ${key} is missing or still an example value. A technician must generate private keys before startup.`);
    }
  }
}
function ensureDocker() {
  const result = spawnSync(docker, ['--context', 'desktop-linux', 'info'], { stdio: 'ignore' });
  if (result.status !== 0) {
    console.log('Starting Docker Desktop...');
    run(docker, ['desktop', 'start'], { cwd: root });
  }
}
async function appResponds() {
  try {
    const r = await fetch('http://127.0.0.1:3102/login', { signal: AbortSignal.timeout(2000) });
    return r.status < 500;
  } catch { return false; }
}
if (process.argv.includes('--dry-run')) {
  console.log(`Plan: ${action}; Supabase folder: ${folder}; app: http://localhost:3102`);
  console.log('Daily startup: Docker Desktop -> existing Compose services -> existing local app build. No pull, migrations or build.');
  process.exit(0);
}

try {
  if (action === 'check') {
    if (Number(process.versions.node.split('.')[0]) < 22) throw Error('Node.js 22 or newer is required.');
    console.log(`Node.js ${process.versions.node}`);
    run('git', ['--version'], { cwd: root });
    if (!existsSync(bash)) throw Error('Git Bash is missing. Install Git for Windows.');
    run(docker, ['--version'], { cwd: root });
    run(docker, ['compose', 'version'], { cwd: root });
    console.log('Requirements found. Docker Desktop must use Linux containers / WSL 2.');
  }
  if (action === 'prepare') {
    const pending = path.join(folder, '.tailor-secrets-pending');
    if (existsSync(pending)) throw Error('A previous key-generation step failed. Ask a technician to inspect it; passwords were not regenerated.');
    if (!existsSync(path.join(folder, 'docker-compose.yml'))) {
      if (existsSync(folder)) throw Error('Target folder already exists without a Compose file. Choose an empty new destination in settings.cmd.');
      const parent = path.dirname(folder);
      mkdirSync(parent, { recursive: true });
      const source = path.join(parent, 'supabase-source-v0.8.1');
      // Do not reuse an unverified checkout for initial installation.
      if (existsSync(source)) throw Error('Source checkout already exists. Inspect it before copying its docker folder to the destination.');
      run('git', ['-c', 'core.autocrlf=false', 'clone', '--depth', '1', '--branch', 'self-hosted/v0.8.1',
        'https://github.com/supabase/supabase.git', source], { cwd: parent });
      cpSync(path.join(source, 'docker'), folder, { recursive: true, errorOnExist: true, force: false });
    }
    if (!existsSync(path.join(folder, '.env'))) {
      if (!existsSync(bash)) throw Error('Git Bash is required to generate the local keys.');
      copyFileSync(path.join(folder, '.env.example'), path.join(folder, '.env'));
      writeFileSync(pending, 'Incomplete setup: do not start services until secret generation succeeds.');
      run(bash, ['--login', '-c', 'cd "$TAILOR_SETUP_DIR" && sh utils/generate-keys.sh --update-env && sh utils/add-new-auth-keys.sh --update-env'],
        { env: { ...process.env, TAILOR_SETUP_DIR: folder.replaceAll('\\', '/') }, quiet: true });
      // Keep a completed marker by renaming only the known file created above.
      const { renameSync } = await import('node:fs');
      renameSync(pending, path.join(folder, '.tailor-secrets-complete'));
      console.log('Local secrets generated and saved privately.');
    } else {
      console.log('Existing .env preserved. Passwords and keys were not regenerated.');
    }
    requireConfig();
    ensureDocker();
    console.log('Downloading service images (one-time setup needs internet)...');
    run(docker, compose('pull'));
    console.log('Supabase prepared. Continue to 03 Start Database.bat.');
  }
  if (action === 'database' || action === 'start') {
    requireConfig();
    if (action === 'start' && !existsSync(path.join(root, '.next-local', 'local-config.json'))) {
      throw Error('Complete 06 Build App.bat once before daily startup.');
    }
    ensureDocker();
    console.log('Starting local database services; first startup can take several minutes...');
    run(docker, compose('up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '180'));
  }
  if (action === 'status' || action === 'database') {
    requireConfig();
    run(docker, compose('ps'));
    if (action === 'status') console.log(`App on port 3102: ${await appResponds() ? 'responding' : 'not responding'}`);
  }
  if (action === 'start') {
    if (await appResponds()) {
      console.log('A server already responds on port 3102. No duplicate server was started.');
      console.log('Use http://localhost:3102, or stop its existing terminal before restarting.');
      process.exit(0);
    }
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'run-local-app.mjs'), folder, '--start-only'],
      { cwd: root, stdio: 'inherit' });
    let stopped = false;
    const finished = new Promise((resolve, reject) => {
      child.once('error', (error) => { stopped = true; reject(error); });
      child.once('exit', (code, signal) => { stopped = true; code === 0 ? resolve() : reject(Error(`App stopped: ${code ?? signal}`)); });
    });
    // Attach rejection handling immediately while readiness polling is running.
    const outcome = finished.then(() => null, (error) => error);
    for (let attempt = 0; attempt < 45 && !stopped; attempt++) {
      if (await appResponds()) {
        const browser = spawn('explorer.exe', ['http://localhost:3102'], { detached: true, stdio: 'ignore' });
        browser.on('error', () => console.log('Open http://localhost:3102 manually.'));
        browser.unref();
        console.log('Server ready. Keep this window open; Ctrl+C stops the app.');
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    const error = await outcome;
    if (error) throw error;
  }
} catch (error) {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
}
