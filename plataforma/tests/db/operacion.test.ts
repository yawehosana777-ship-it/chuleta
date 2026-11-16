// Fase 5: encargado del pedido, áreas de preparación y avisos de atraso.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { como, crearBaseDeDatos } from "./base-de-datos";

const U = {
  dueno: "00000000-0000-0000-0000-0000000008a1",
  ana: "00000000-0000-0000-0000-0000000008a2",    // orders.update
  beto: "00000000-0000-0000-0000-0000000008a3",   // orders.update
  caja: "00000000-0000-0000-0000-0000000008a4",   // solo orders.view
  duenoB: "00000000-0000-0000-0000-0000000008b1",
};
const R = { a: "10000000-0000-0000-0000-0000000008aa", b: "10000000-0000-0000-0000-0000000008bb" };
const AREA_B = "70000000-0000-0000-0000-0000000008bb";
const CAT = "20000000-0000-0000-0000-0000000008aa";
const PEDIDO = "80000000-0000-0000-0000-0000000008aa";

let db: PGlite;
const tomar = (u: string, tomar = true) => como(db, "authenticated", u, "select assign_order($1, $2)", [PEDIDO, tomar]);
const encargado = async () =>
  (await como<{ a: string | null }>(db, "postgres", null, "select assigned_to a from orders where id = $1", [PEDIDO])).rows[0].a;

beforeAll(async () => {
  db = await crearBaseDeDatos();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${U.dueno}', 'd@x.gt'), ('${U.ana}', 'a@x.gt'), ('${U.beto}', 'b@x.gt'), ('${U.caja}', 'c@x.gt'), ('${U.duenoB}', 'e@x.gt');
    insert into profiles (user_id, full_name) values ('${U.dueno}', 'Dueño'), ('${U.ana}', 'Ana'), ('${U.beto}', 'Beto'), ('${U.caja}', 'Caja');
    insert into restaurants (id, slug, name, status) values ('${R.a}', 'resto-o', 'Resto O', 'active'), ('${R.b}', 'resto-p', 'Resto P', 'active');
    insert into memberships (id, restaurant_id, user_id, role) values
      ('60000000-0000-0000-0000-000000000801', '${R.a}', '${U.dueno}', 'owner'),
      ('60000000-0000-0000-0000-000000000802', '${R.a}', '${U.ana}', 'staff'),
      ('60000000-0000-0000-0000-000000000803', '${R.a}', '${U.beto}', 'staff'),
      ('60000000-0000-0000-0000-000000000804', '${R.a}', '${U.caja}', 'staff'),
      ('60000000-0000-0000-0000-000000000805', '${R.b}', '${U.duenoB}', 'owner');
    insert into membership_permissions (restaurant_id, membership_id, permission) values
      ('${R.a}', '60000000-0000-0000-0000-000000000802', 'orders.update'),
      ('${R.a}', '60000000-0000-0000-0000-000000000803', 'orders.update'),
      ('${R.a}', '60000000-0000-0000-0000-000000000804', 'orders.view');
    insert into areas (id, restaurant_id, name) values ('${AREA_B}', '${R.b}', 'Barra');
    insert into categories (id, restaurant_id, name) values ('${CAT}', '${R.a}', 'Carnes');
    insert into orders (id, restaurant_id, number, type, subtotal_cents, total_cents, customer_name, customer_phone, delivery_address, idempotency_key)
      values ('${PEDIDO}', '${R.a}', 1, 'delivery', 1000, 1000, 'X', '5555-0000', 'Dirección', 'clave-operacion-0001');
  `);
});

describe("encargado del pedido", () => {
  it("sin permiso para atender pedidos no se puede tomar; otro restaurante tampoco", async () => {
    await expect(tomar(U.caja)).rejects.toThrow(/not_authorized/);
    await expect(tomar(U.duenoB)).rejects.toThrow(/not_authorized/);
  });

  it("Ana lo toma y Beto ya no puede tomarlo", async () => {
    await tomar(U.ana);
    expect(await encargado()).toBe(U.ana);
    await expect(tomar(U.beto)).rejects.toThrow(/already_assigned/);
  });

  it("Beto no puede soltar el pedido de Ana; el dueño sí", async () => {
    await expect(tomar(U.beto, false)).rejects.toThrow(/not_authorized/);
    await tomar(U.dueno, false);
    expect(await encargado()).toBeNull();
  });

  it("los nombres del equipo solo los ve alguien del restaurante", async () => {
    const propio = await como<{ full_name: string }>(db, "authenticated", U.caja, "select full_name from team_names($1) order by 1", [R.a]);
    expect(propio.rows.map((r) => r.full_name)).toEqual(["Ana", "Beto", "Caja", "Dueño"]);
    const ajeno = await como(db, "authenticated", U.duenoB, "select * from team_names($1)", [R.a]);
    expect(ajeno.rows).toHaveLength(0);
  });
});

describe("áreas de preparación", () => {
  it("una categoría no puede apuntar al área de otro restaurante", async () => {
    await expect(como(db, "authenticated", U.dueno, "update categories set area_id = $1 where id = $2", [AREA_B, CAT]))
      .rejects.toThrow(/foreign key|violates/);
  });

  it("borrar un área deja sus categorías sin área (no las borra)", async () => {
    await db.exec(`insert into areas (id, restaurant_id, name) values ('70000000-0000-0000-0000-0000000008aa', '${R.a}', 'Cocina');
                   update categories set area_id = '70000000-0000-0000-0000-0000000008aa' where id = '${CAT}'`);
    await como(db, "authenticated", U.dueno, "delete from areas where id = '70000000-0000-0000-0000-0000000008aa'");
    const { rows } = await como<{ area_id: string | null }>(db, "postgres", null, "select area_id from categories where id = $1", [CAT]);
    expect(rows[0].area_id).toBeNull();
  });
});

describe("avisos de atraso", () => {
  it("los minutos tienen límites razonables", async () => {
    await expect(como(db, "authenticated", U.dueno, "update restaurants set alert_accept_minutes = 0 where id = $1", [R.a]))
      .rejects.toThrow(/check/);
    await como(db, "authenticated", U.dueno, "update restaurants set alert_accept_minutes = 8 where id = $1", [R.a]);
  });
});
