// First-time schema installation for the local Docker Desktop database only.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = process.argv[2];
if (!directory || !existsSync(path.join(directory, 'docker-compose.yml'))) {
  throw Error('Usage: node scripts/setup-local-database.mjs E:\\TailorLocal\\supabase-local');
}
const docker = [
  path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe'),
  path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'),
].find(existsSync) ?? 'docker';
const composeDirectory = path.resolve(directory);
const args = ['--context', 'desktop-linux', 'compose', '--project-directory', composeDirectory,
  'exec', '-T', 'db', 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
function sql(input) {
  // COMPOSE_FILE in Supabase's .env is relative to the process working directory.
  const result = spawnSync(docker, [...args, '-Atq'], { cwd: composeDirectory, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(result.stderr.slice(-4000) || result.stdout.slice(-4000));
  return result.stdout.trim();
}
const count = sql("select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';");
if (count !== '0') throw Error('Stopped: this database already has public tables. This installer only accepts a fresh local database.');
if (process.argv.includes('--check')) {
  console.log('Local database connection verified; no public tables exist. Ready to install.');
  process.exit(0);
}
const migrations = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(migrations).filter((file) => file.endsWith('.sql')).sort();
const source = files.map((file) => {
  // Migration 0103 has its own transaction. The initial install wraps all files
  // in one transaction so an error cannot leave a half-installed schema.
  const body = readFileSync(new URL(file, migrations), 'utf8').replace(/^\s*(?:begin|commit);\s*$/gim, '');
  return `\n-- Migration: ${file}\n${body}\n`;
}).join('\n');
console.log(`Installing ${files.length} migrations in the fresh local Docker database...`);
sql(`begin;\nset local search_path = public, extensions;\n${source}\ncommit;`);
const tables = sql("select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';");
console.log(`Local schema installed successfully: ${files.length} migrations, ${tables} public tables.`);
console.log('No cloud connection or customer-data import was made. Local test accounts are the next step.');
