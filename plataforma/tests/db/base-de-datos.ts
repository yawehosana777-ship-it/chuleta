// Levanta un PostgreSQL real en memoria (PGlite) con lo mínimo que Supabase
// aporta (roles, esquema auth, auth.uid()) y aplica nuestras migraciones.
// Permite probar el aislamiento SIN tocar el proyecto de Supabase.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const MIGRACIONES = join(__dirname, "..", "..", "supabase", "migrations");

const PRELUDIO_SUPABASE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;

  create schema auth;
  create table auth.users (id uuid primary key, email text, created_at timestamptz not null default now());
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;

  create schema extensions;

  -- Igual que Supabase: por defecto todo lo nuevo en public queda concedido.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export async function crearBaseDeDatos() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(PRELUDIO_SUPABASE);
  for (const archivo of readdirSync(MIGRACIONES).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRACIONES, archivo), "utf8"));
  }
  return db;
}

export type Rol = "anon" | "authenticated" | "service_role" | "postgres";

/** Ejecuta una consulta como un rol (y usuario) concreto, igual que haría la API de Supabase. */
export async function como<T = Record<string, unknown>>(
  db: PGlite,
  rol: Rol,
  usuario: string | null,
  sql: string,
  params: unknown[] = [],
) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${usuario ?? ""}', false);`);
  if (rol !== "postgres") await db.exec(`set role ${rol}`);
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec("reset role");
  }
}
