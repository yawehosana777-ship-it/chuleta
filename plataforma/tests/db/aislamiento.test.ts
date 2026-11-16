// Pruebas de aislamiento entre restaurantes y permisos (Fase 1).
// Se ejecutan sin internet: npm run test:db
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { como, crearBaseDeDatos } from "./base-de-datos";

const U = {
  duenoA: "00000000-0000-0000-0000-00000000000a",
  duenoB: "00000000-0000-0000-0000-00000000000b",
  meseroA: "00000000-0000-0000-0000-0000000000c1",
};
const R = {
  a: "10000000-0000-0000-0000-00000000000a",
  b: "10000000-0000-0000-0000-00000000000b",
  pendiente: "10000000-0000-0000-0000-0000000000cc",
};
const CAT = { a: "20000000-0000-0000-0000-00000000000a", b: "20000000-0000-0000-0000-00000000000b" };
const PROD = {
  aActivo: "30000000-0000-0000-0000-0000000000a1",
  aInactivo: "30000000-0000-0000-0000-0000000000a2",
  bActivo: "30000000-0000-0000-0000-0000000000b1",
  bInactivo: "30000000-0000-0000-0000-0000000000b2",
};

let db: PGlite;

beforeAll(async () => {
  db = await crearBaseDeDatos();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${U.duenoA}', 'a@prueba.gt'), ('${U.duenoB}', 'b@prueba.gt'), ('${U.meseroA}', 'mesero@prueba.gt');

    insert into restaurants (id, slug, name, status) values
      ('${R.a}', 'restaurante-a', 'Restaurante A', 'active'),
      ('${R.b}', 'restaurante-b', 'Restaurante B', 'active'),
      ('${R.pendiente}', 'restaurante-pendiente', 'Pendiente', 'pending');

    insert into memberships (restaurant_id, user_id, role) values
      ('${R.a}', '${U.duenoA}', 'owner'),
      ('${R.b}', '${U.duenoB}', 'owner'),
      ('${R.a}', '${U.meseroA}', 'staff');

    insert into categories (id, restaurant_id, name) values
      ('${CAT.a}', '${R.a}', 'Carnes A'), ('${CAT.b}', '${R.b}', 'Carnes B');

    insert into products (id, restaurant_id, category_id, name, price_cents, active) values
      ('${PROD.aActivo}',   '${R.a}', '${CAT.a}', 'Chuleta A', 3000, true),
      ('${PROD.aInactivo}', '${R.a}', '${CAT.a}', 'Oculto A',  1000, false),
      ('${PROD.bActivo}',   '${R.b}', '${CAT.b}', 'Chuleta B', 3500, true),
      ('${PROD.bInactivo}', '${R.b}', '${CAT.b}', 'Oculto B',  1000, false);

    insert into invitations (restaurant_id, email, role, token_hash, expires_at)
      values ('${R.a}', 'x@prueba.gt', 'staff', repeat('a', 64), now() + interval '1 day');
  `);
});

describe("cliente anónimo (menú público)", () => {
  it("solo ve restaurantes activos", async () => {
    const { rows } = await como<{ slug: string }>(db, "anon", null, "select slug from restaurants order by slug");
    expect(rows.map((r) => r.slug)).toEqual(["restaurante-a", "restaurante-b"]);
  });

  it("solo ve productos activos", async () => {
    const { rows } = await como<{ name: string }>(db, "anon", null, "select name from products order by name");
    expect(rows.map((r) => r.name)).toEqual(["Chuleta A", "Chuleta B"]);
  });

  it("no puede leer pedidos, mesas, membresías ni invitaciones", async () => {
    for (const tabla of ["orders", "tables", "memberships", "invitations", "audit_log"]) {
      await expect(como(db, "anon", null, `select * from ${tabla}`)).rejects.toThrow(/permission denied/);
    }
  });

  it("no puede modificar productos", async () => {
    await expect(
      como(db, "anon", null, `update products set price_cents = 1 where id = '${PROD.aActivo}'`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("dueño del restaurante A", () => {
  it("ve todos sus productos (incluso inactivos) pero los inactivos de B no", async () => {
    const { rows } = await como<{ name: string }>(db, "authenticated", U.duenoA, "select name from products order by name");
    expect(rows.map((r) => r.name)).toEqual(["Chuleta A", "Chuleta B", "Oculto A"]);
  });

  it("puede cambiar el precio de un producto suyo", async () => {
    const r = await como(db, "authenticated", U.duenoA,
      `update products set price_cents = 3200 where id = '${PROD.aActivo}'`);
    expect(r.affectedRows).toBe(1);
  });

  it("NO puede cambiar productos del restaurante B", async () => {
    const r = await como(db, "authenticated", U.duenoA,
      `update products set price_cents = 1 where id = '${PROD.bActivo}'`);
    expect(r.affectedRows).toBe(0);
    const { rows } = await como<{ price_cents: number }>(db, "postgres", null,
      `select price_cents from products where id = '${PROD.bActivo}'`);
    expect(rows[0].price_cents).toBe(3500);
  });

  it("NO puede borrar productos del restaurante B", async () => {
    const r = await como(db, "authenticated", U.duenoA, `delete from products where id = '${PROD.bActivo}'`);
    expect(r.affectedRows).toBe(0);
  });

  it("NO puede crear productos en el restaurante B", async () => {
    await expect(
      como(db, "authenticated", U.duenoA,
        `insert into products (restaurant_id, category_id, name, price_cents) values ('${R.b}', '${CAT.b}', 'Intruso', 1)`),
    ).rejects.toThrow(/row-level security/);
  });

  it("NO puede mover un producto suyo al restaurante B", async () => {
    await expect(
      como(db, "authenticated", U.duenoA,
        `update products set restaurant_id = '${R.b}', category_id = '${CAT.b}' where id = '${PROD.aInactivo}'`),
    ).rejects.toThrow(/row-level security/);
  });

  it("NO ve las membresías del restaurante B", async () => {
    const { rows } = await como<{ restaurant_id: string }>(db, "authenticated", U.duenoA,
      "select restaurant_id from memberships");
    expect(rows.every((r) => r.restaurant_id === R.a)).toBe(true);
  });

  it("puede editar datos de su restaurante pero NO su estado ni su slug", async () => {
    const ok = await como(db, "authenticated", U.duenoA, `update restaurants set phone = '5555-5555' where id = '${R.a}'`);
    expect(ok.affectedRows).toBe(1);
    await expect(
      como(db, "authenticated", U.duenoA, `update restaurants set status = 'active' where id = '${R.pendiente}'`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      como(db, "authenticated", U.duenoA, `update restaurants set slug = 'otro' where id = '${R.a}'`),
    ).rejects.toThrow(/permission denied/);
  });

  it("NO puede leer invitaciones ni usar funciones del servidor", async () => {
    await expect(como(db, "authenticated", U.duenoA, "select * from invitations")).rejects.toThrow(/permission denied/);
    await expect(
      como(db, "authenticated", U.duenoA, `select accept_invitation(repeat('a', 64), '${U.duenoA}', 'X')`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("personal sin permisos", () => {
  it("no puede editar el menú de su propio restaurante", async () => {
    const r = await como(db, "authenticated", U.meseroA,
      `update products set price_cents = 1 where id = '${PROD.aActivo}'`);
    expect(r.affectedRows).toBe(0);
  });

  it("al recibir el permiso menu.edit, sí puede", async () => {
    await db.exec(`
      insert into membership_permissions (restaurant_id, membership_id, permission)
      select restaurant_id, id, 'menu.edit' from memberships where user_id = '${U.meseroA}'`);
    const r = await como(db, "authenticated", U.meseroA,
      `update products set description = 'Jugosa' where id = '${PROD.aActivo}'`);
    expect(r.affectedRows).toBe(1);
  });
});

describe("integridad entre restaurantes", () => {
  it("la base de datos rechaza un producto de A en una categoría de B", async () => {
    await expect(
      como(db, "postgres", null,
        `insert into products (restaurant_id, category_id, name, price_cents) values ('${R.a}', '${CAT.b}', 'Mezcla', 100)`),
    ).rejects.toThrow(/foreign key/);
  });

  it("no se permiten precios negativos", async () => {
    await expect(
      como(db, "postgres", null, `update products set price_cents = -1 where id = '${PROD.aActivo}'`),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("auditoría", () => {
  it("registra quién cambió un precio", async () => {
    const { rows } = await como<{ actor_user_id: string; entity: string }>(db, "postgres", null,
      `select actor_user_id, entity from audit_log
       where entity = 'products' and entity_id = '${PROD.aActivo}' and action = 'update'
       order by id`);
    expect(rows[0]).toMatchObject({ actor_user_id: U.duenoA, entity: "products" });
  });
});

describe("alta de restaurantes por invitación (servidor)", () => {
  const token = "b".repeat(64);
  const nuevoDueno = "00000000-0000-0000-0000-0000000000dd";

  it("crea un restaurante pendiente con su invitación", async () => {
    await como(db, "service_role", null,
      `select create_restaurant_with_invitation('Don Prueba', 'don-prueba', 'Dueno@Prueba.gt', '${token}', now() + interval '72 hours')`);
    const { rows } = await como<{ status: string }>(db, "postgres", null,
      "select status from restaurants where slug = 'don-prueba'");
    expect(rows[0].status).toBe("pending");
  });

  it("aceptar la invitación activa el restaurante y crea al dueño", async () => {
    await db.exec(`insert into auth.users (id, email) values ('${nuevoDueno}', 'dueno@prueba.gt')`);
    const { rows } = await como<{ slug: string }>(db, "service_role", null,
      `select accept_invitation('${token}', '${nuevoDueno}', 'Dueño Prueba') as slug`);
    expect(rows[0].slug).toBe("don-prueba");
    const r = await como<{ status: string; role: string }>(db, "postgres", null,
      `select r.status, m.role from restaurants r join memberships m on m.restaurant_id = r.id
       where r.slug = 'don-prueba' and m.user_id = '${nuevoDueno}'`);
    expect(r.rows[0]).toEqual({ status: "active", role: "owner" });
  });

  it("la invitación no se puede usar dos veces", async () => {
    await expect(
      como(db, "service_role", null, `select accept_invitation('${token}', '${nuevoDueno}', 'Otra vez')`),
    ).rejects.toThrow(/invitation_used/);
  });

  it("una invitación vencida se rechaza", async () => {
    const vencido = "c".repeat(64);
    await como(db, "service_role", null,
      `select new_invitation('don-prueba', 'tarde@prueba.gt', 'staff', '${vencido}', now() - interval '1 minute')`);
    await expect(
      como(db, "service_role", null, `select accept_invitation('${vencido}', '${nuevoDueno}', 'Tarde')`),
    ).rejects.toThrow(/invitation_expired/);
  });
});

describe("restaurante suspendido", () => {
  it("su dueño pierde el acceso y el público deja de verlo", async () => {
    await como(db, "service_role", null, "select set_restaurant_status('restaurante-b', 'suspended')");
    const dueno = await como(db, "authenticated", U.duenoB,
      `update products set price_cents = 1 where id = '${PROD.bActivo}'`);
    expect(dueno.affectedRows).toBe(0);
    const { rows } = await como<{ slug: string }>(db, "anon", null, "select slug from restaurants");
    expect(rows.map((r) => r.slug)).not.toContain("restaurante-b");
  });
});
