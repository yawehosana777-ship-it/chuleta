// Invitación sin clave secreta + SQL de alta y carta para el SQL Editor.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { hashToken } from "@/lib/invitaciones";
import { como, crearBaseDeDatos } from "./base-de-datos";

const DUENO = "00000000-0000-0000-0000-0000000000d1";
const INTRUSO = "00000000-0000-0000-0000-0000000000e1";
const VIEJO = "00000000-0000-0000-0000-0000000000f1";

let db: PGlite;
let token: string;

beforeAll(async () => {
  db = await crearBaseDeDatos();
  // Igual que en el SQL Editor (rol postgres).
  const { rows } = await como<{ token: string }>(db, "postgres", null,
    "select create_restaurant_invite('Don Chuleta', 'don-chuleta', 'Dueno@DonChuleta.gt') as token");
  token = rows[0].token;
});

describe("token generado en la base de datos", () => {
  it("tiene el formato esperado y su hash coincide con el de la aplicación", async () => {
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { rows } = await como<{ token_hash: string }>(db, "postgres", null, "select token_hash from invitations");
    expect(rows[0].token_hash).toBe(hashToken(token));
  });

  it("anon/authenticated no pueden crear restaurantes", async () => {
    await expect(
      como(db, "anon", null, "select create_restaurant_invite('X', 'xxx', 'x@x.gt')"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      como(db, "authenticated", DUENO, "select new_invitation_token('don-chuleta', 'x@x.gt', 'owner')"),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("vista previa de la invitación (clave pública)", () => {
  it("con el token correcto muestra restaurante y correo", async () => {
    const { rows } = await como<{ restaurant_name: string; email: string }>(db, "anon", null,
      "select * from invitation_preview_by_token($1)", [token]);
    expect(rows[0]).toMatchObject({ restaurant_name: "Don Chuleta", email: "dueno@donchuleta.gt" });
  });

  it("con un token falso no devuelve nada", async () => {
    const { rows } = await como(db, "anon", null, "select * from invitation_preview_by_token($1)", ["x".repeat(43)]);
    expect(rows).toHaveLength(0);
  });
});

describe("aceptar invitación tras crear la cuenta", () => {
  it("rechaza una cuenta con otro correo", async () => {
    await db.exec(`insert into auth.users (id, email) values ('${INTRUSO}', 'intruso@correo.gt')`);
    await expect(
      como(db, "anon", null, "select accept_invitation_signup($1, $2, 'Intruso')", [token, INTRUSO]),
    ).rejects.toThrow(/invitation_user_mismatch/);
  });

  it("rechaza una cuenta antigua aunque tenga el mismo correo", async () => {
    await db.exec(`insert into auth.users (id, email, created_at) values ('${VIEJO}', 'dueno@donchuleta.gt', now() - interval '1 hour')`);
    await expect(
      como(db, "anon", null, "select accept_invitation_signup($1, $2, 'Viejo')", [token, VIEJO]),
    ).rejects.toThrow(/invitation_user_mismatch/);
  });

  it("un usuario con sesión no puede aceptar a nombre de otro", async () => {
    await db.exec(`insert into auth.users (id, email) values ('${DUENO}', 'dueno@donchuleta.gt')`);
    await expect(
      como(db, "authenticated", INTRUSO, "select accept_invitation_signup($1, $2, 'X')", [token, DUENO]),
    ).rejects.toThrow(/invitation_user_mismatch/);
  });

  it("la cuenta recién creada con el correo invitado se convierte en dueña y activa el restaurante", async () => {
    const { rows } = await como<{ slug: string }>(db, "authenticated", DUENO,
      "select accept_invitation_signup($1, $2, 'Dueño Don Chuleta') as slug", [token, DUENO]);
    expect(rows[0].slug).toBe("don-chuleta");
    const r = await como<{ status: string; role: string }>(db, "postgres", null,
      `select r.status, m.role from restaurants r join memberships m on m.restaurant_id = r.id
       where r.slug = 'don-chuleta' and m.user_id = '${DUENO}'`);
    expect(r.rows[0]).toEqual({ status: "active", role: "owner" });
  });

  it("no se puede reutilizar", async () => {
    await expect(
      como(db, "anon", null, "select accept_invitation_signup($1, $2, 'Otra vez')", [token, DUENO]),
    ).rejects.toThrow(/invitation_used/);
  });
});

describe("SQL de la carta para el SQL Editor", () => {
  const sql = readFileSync(join(__dirname, "..", "..", "supabase", "seed", "don-chuleta.sql"), "utf8");

  it("carga las 8 categorías, 50 productos y opciones de micheladas", async () => {
    await db.exec(sql);
    const { rows } = await como<{ c: number; p: number; o: number; sin_precio: number }>(db, "postgres", null, `
      select (select count(*)::int from categories) c, (select count(*)::int from products) p,
             (select count(*)::int from options) o,
             (select count(*)::int from products where price_cents is null) sin_precio`);
    expect(rows[0]).toEqual({ c: 8, p: 50, o: 4, sin_precio: 6 });
  });

  it("el dueño ve su carta y el público también (restaurante activo)", async () => {
    const dueno = await como(db, "authenticated", DUENO, "select id from products");
    const publico = await como(db, "anon", null, "select id from products");
    expect(dueno.rows).toHaveLength(50);
    expect(publico.rows).toHaveLength(50);
  });

  it("ejecutarlo dos veces no duplica la carta", async () => {
    await expect(db.exec(sql)).rejects.toThrow(/ya tiene carta/);
  });
});
