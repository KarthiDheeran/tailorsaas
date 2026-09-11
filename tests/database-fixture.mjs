import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readdirSync, readFileSync } from "node:fs";

// Supabase-managed objects only. All application tables, functions, triggers,
// and RLS policies come from the real, unmodified migration files.
export async function createMigratedDatabase() {
  const db = new PGlite({ extensions: { pgcrypto, pg_trgm } });
  const applied = [];
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create schema storage;
      create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
    `);
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
      try {
        await db.exec(readFileSync(new URL(file, directory), "utf8"));
        applied.push(file);
      } catch (error) {
        throw new Error(`Migration ${file} failed after ${applied.length} applied: ${error.message}`, { cause: error });
      }
    }
    return { db, applied };
  } catch (error) {
    await db.close();
    throw error;
  }
}

export async function asUser(db, userId, work) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await tx.exec("set local role authenticated");
    return work(tx);
  });
}
