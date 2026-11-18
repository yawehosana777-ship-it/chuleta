// Fase 7: auditoría automática de la base de datos. Revisa el catálogo de
// PostgreSQL completo y falla si algo queda abierto: así una migración
// futura no puede "olvidar" una regla sin que las pruebas lo noten.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { como, crearBaseDeDatos } from "./base-de-datos";

let db: PGlite;
beforeAll(async () => { db = await crearBaseDeDatos(); });

const filas = async <T,>(sql: string) => (await como<T>(db, "postgres", null, sql)).rows;

describe("tablas", () => {
  it("todas las tablas de datos tienen RLS activado", async () => {
    const sinRls = await filas<{ tabla: string }>(
      "select relname as tabla from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity");
    expect(sinRls).toEqual([]);
  });

  it("el público (sin cuenta) no puede escribir en ninguna tabla", async () => {
    const escribe = await filas<{ tabla: string }>(`
      select c.relname as tabla from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
        and (has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
             or has_table_privilege('anon', c.oid, 'DELETE') or has_table_privilege('anon', c.oid, 'TRUNCATE'))`);
    expect(escribe).toEqual([]);
  });

  it("pedidos, cobros, cuentas, membresías, invitaciones y auditoría solo se escriben mediante funciones revisadas", async () => {
    const protegidas = ["orders", "order_items", "order_events", "cash_payments", "table_accounts", "memberships",
      "membership_permissions", "invitations", "audit_log", "notifications"];
    const escribe = await filas<{ tabla: string }>(`
      select c.relname as tabla from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relname = any (array['${protegidas.join("','")}'])
        and (has_table_privilege('authenticated', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'UPDATE')
             or has_table_privilege('authenticated', c.oid, 'DELETE') or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))`);
    expect(escribe).toEqual([]);
  });

  it("del restaurante, el personal solo puede cambiar columnas permitidas (nunca el slug ni el estado)", async () => {
    const { rows } = await como<{ slug: boolean; estado: boolean; nombre: boolean }>(db, "postgres", null, `
      select has_column_privilege('authenticated', 'public.restaurants', 'slug', 'UPDATE') as slug,
             has_column_privilege('authenticated', 'public.restaurants', 'status', 'UPDATE') as estado,
             has_column_privilege('authenticated', 'public.restaurants', 'name', 'UPDATE') as nombre`);
    expect(rows[0]).toEqual({ slug: false, estado: false, nombre: true });
  });

  it("toda tabla con datos de un restaurante tiene al menos una regla de lectura", async () => {
    const sinRegla = await filas<{ tabla: string }>(`
      select c.relname as tabla from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
        and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'restaurant_id')
        and c.relname <> 'invitations'   -- a propósito sin reglas: solo funciones del servidor
        and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
                        and p.cmd in ('SELECT', 'ALL'))`);
    expect(sinRegla).toEqual([]);
  });
});

describe("funciones", () => {
  it("toda función SECURITY DEFINER fija su search_path (evita que la engañen con objetos falsos)", async () => {
    const sinRuta = await filas<{ funcion: string }>(`
      select p.oid::regprocedure::text as funcion from pg_proc p
      where p.pronamespace in ('public'::regnamespace, 'app'::regnamespace) and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    expect(sinRuta).toEqual([]);
  });

  it("el público (sin cuenta) solo puede usar las funciones de cliente previstas", async () => {
    const usables = await filas<{ funcion: string }>(`
      select p.proname as funcion from pg_proc p
      where p.pronamespace in ('public'::regnamespace, 'app'::regnamespace)
        and has_function_privilege('anon', p.oid, 'EXECUTE')
      order by 1`);
    expect(usables.map((f) => f.funcion)).toEqual([
      // Cliente: invitación del dueño, mesa, pedidos y seguimiento.
      "accept_invitation_signup", "can_manage_user", "create_delivery_order", "create_table_order",
      // Reglas RLS (solo responden sí/no sobre el usuario actual) y utilidades sin efectos.
      "has_permission", "invitation_preview_by_token", "is_member", "is_public",
      "order_by_token", "table_by_qr", "uuid_o_nulo",
    ]);
  });

  it("las funciones que solo usa el servidor no las puede llamar nadie con sesión", async () => {
    const abiertas = await filas<{ funcion: string }>(`
      select p.proname as funcion from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('create_restaurant_with_invitation', 'new_invitation', 'invitation_preview', 'accept_invitation',
                          'set_restaurant_status', 'create_restaurant_invite', 'new_invitation_token')
        and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))`);
    expect(abiertas).toEqual([]);
  });
});

describe("límite contra pedidos falsos", () => {
  it("más de 30 pedidos en un minuto en el mismo restaurante se rechazan", async () => {
    const R = "10000000-0000-0000-0000-000000000a01";
    await db.exec(`insert into restaurants (id, slug, name, status) values ('${R}', 'resto-limite', 'Límite', 'active')`);
    const insertar = (n: number) => db.exec(`insert into orders (restaurant_id, number, type, subtotal_cents, total_cents, customer_name, customer_phone, delivery_address, idempotency_key)
      values ('${R}', ${n}, 'delivery', 0, 0, 'X', '5555-0000', 'Dirección', 'limite-prueba-${String(n).padStart(6, "0")}')`);
    for (let n = 1; n <= 30; n++) await insertar(n);
    await expect(insertar(31)).rejects.toThrow(/too_many_requests/);
  });
});

describe("fotos (Storage)", () => {
  it("subir, cambiar y borrar fotos exige el permiso de editar el menú de ESE restaurante", async () => {
    const reglas = await filas<{ policyname: string; cmd: string }>(
      "select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname");
    expect(reglas).toEqual([
      { policyname: "menu_fotos_borrar", cmd: "DELETE" },
      { policyname: "menu_fotos_cambiar", cmd: "UPDATE" },
      { policyname: "menu_fotos_subir", cmd: "INSERT" },
    ]);
  });
});
