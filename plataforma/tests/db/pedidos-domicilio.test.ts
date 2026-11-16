// Fase 4 (parte B): pedidos a domicilio (gratis, dentro de la zona, pago en efectivo).
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { como, crearBaseDeDatos } from "./base-de-datos";

const DUENO = "00000000-0000-0000-0000-0000000007a1";
const R = "10000000-0000-0000-0000-0000000007aa";
const CAT = "20000000-0000-0000-0000-0000000007aa";
const CHULETA = "30000000-0000-0000-0000-000000000701";

let db: PGlite;
let n = 0;
const clave = () => `domicilio-clave-${String(++n).padStart(6, "0")}`;

type Creado = { order_number: number; tracking_token: string; total_cents: number };
type Cliente = { nombre?: string; telefono?: string; direccion?: string; clave?: string; cantidad?: number };
const pedir = (c: Cliente = {}) =>
  como<Creado>(db, "anon", null, "select * from create_delivery_order('resto-d', $1::jsonb, $2, $3, $4, 'Frente a la iglesia', null, $5)", [
    JSON.stringify([{ product_id: CHULETA, quantity: c.cantidad ?? 1 }]),
    c.nombre ?? "Ana López", c.telefono ?? "+502 5555 1234", c.direccion ?? "Barrio El Centro, casa 12", c.clave ?? clave(),
  ]);
const ajustes = (sql: string) => db.exec(`update delivery_settings set ${sql} where restaurant_id = '${R}'`);

beforeAll(async () => {
  db = await crearBaseDeDatos();
  await db.exec(`
    insert into auth.users (id, email) values ('${DUENO}', 'd@x.gt');
    insert into restaurants (id, slug, name, status, delivery_enabled) values ('${R}', 'resto-d', 'Resto D', 'active', false);
    insert into memberships (restaurant_id, user_id, role) values ('${R}', '${DUENO}', 'owner');
    insert into delivery_settings (restaurant_id, method, fixed_fee_cents, area_note) values ('${R}', 'fixed', 0, 'Solo Malacatancito');
    insert into categories (id, restaurant_id, name) values ('${CAT}', '${R}', 'Carnes');
    insert into products (id, restaurant_id, category_id, name, price_cents) values ('${CHULETA}', '${R}', '${CAT}', 'Chuleta', 3000);
    insert into opening_hours (restaurant_id, service, weekday, opens_at, closes_at)
      select '${R}', 'dine_in', d, t.o, t.c from generate_series(0, 6) d,
        (values ('00:00'::time, '12:00'::time), ('12:00'::time, '00:00'::time)) t(o, c);
  `);
});

describe("pedido a domicilio", () => {
  it("si el restaurante no tiene domicilio activado, se rechaza", async () => {
    await expect(pedir()).rejects.toThrow(/delivery_disabled/);
    await db.exec(`update restaurants set delivery_enabled = true where id = '${R}'`);
  });

  it("envío gratis: el total es el de los productos y el teléfono queda normalizado", async () => {
    const { rows } = await pedir({ cantidad: 2 });
    expect(rows[0]).toMatchObject({ order_number: 1, total_cents: 6000 });
    const o = await como<{ type: string; delivery_fee_cents: number; customer_phone: string; delivery_references: string }>(db, "postgres", null,
      "select type, delivery_fee_cents, customer_phone, delivery_references from orders where number = 1");
    expect(o.rows[0]).toEqual({ type: "delivery", delivery_fee_cents: 0, customer_phone: "5555-1234", delivery_references: "Frente a la iglesia" });
  });

  it("si otro restaurante cobra envío, se suma al total (configurable)", async () => {
    await ajustes("fixed_fee_cents = 1500");
    const { rows } = await pedir({ telefono: "4444-0001" });
    expect(rows[0].total_cents).toBe(3000 + 1500);
    await ajustes("fixed_fee_cents = 0");
  });

  it("respeta el pedido mínimo cuando existe", async () => {
    await ajustes("min_order_cents = 5000");
    await expect(pedir({ telefono: "4444-0002" })).rejects.toThrow(/below_minimum/);
    await ajustes("min_order_cents = 0");
  });

  it("valida teléfono, nombre y dirección", async () => {
    await expect(pedir({ telefono: "123" })).rejects.toThrow(/invalid_phone/);
    await expect(pedir({ telefono: "abcd-efgh" })).rejects.toThrow(/invalid_phone/);
    await expect(pedir({ nombre: "A" })).rejects.toThrow(/invalid_customer/);
    await expect(pedir({ direccion: "x" })).rejects.toThrow(/invalid_customer/);
  });

  it("tocar dos veces no duplica el pedido", async () => {
    const k = clave();
    const a = await pedir({ clave: k, telefono: "4444-0003" });
    const b = await pedir({ clave: k, telefono: "4444-0003", cantidad: 5 });
    expect(b.rows[0]).toEqual(a.rows[0]);
  });

  it("un mismo teléfono no puede tener más de 3 pedidos sin terminar", async () => {
    await pedir({ telefono: "3333-0000" });
    await pedir({ telefono: "3333-0000" });
    await pedir({ telefono: "3333-0000" });
    await expect(pedir({ telefono: "3333 0000" })).rejects.toThrow(/too_many_orders/);
  });

  it("los datos del cliente no se pueden leer sin sesión", async () => {
    await expect(como(db, "anon", null, "select customer_phone from orders")).rejects.toThrow(/permission denied/);
  });

  it("el seguimiento muestra que es a domicilio y la dirección", async () => {
    const { rows } = await pedir({ telefono: "4444-0004" });
    const s = await como<{ d: { type: string; address: string; delivery_fee_cents: number; account: unknown } }>(db, "anon", null,
      "select order_by_token($1) as d", [rows[0].tracking_token]);
    expect(s.rows[0].d).toMatchObject({ type: "delivery", address: "Barrio El Centro, casa 12", delivery_fee_cents: 0, account: null });
  });

  it("al marcarlo entregado queda registrado el cobro en efectivo", async () => {
    const { rows: [p] } = await como<{ id: string; total_cents: number }>(db, "postgres", null,
      "select id, total_cents from orders where number = 1");
    await como(db, "authenticated", DUENO, "select set_order_status($1, 'aceptado', 1)", [p.id]);
    await como(db, "authenticated", DUENO, "select set_order_status($1, 'entregado', 2)", [p.id]);
    const pago = await como<{ amount_cents: number; received_by: string }>(db, "postgres", null,
      "select amount_cents, received_by from cash_payments where order_id = $1", [p.id]);
    expect(pago.rows[0]).toEqual({ amount_cents: p.total_cents, received_by: DUENO });
  });

  it("con los pedidos en pausa tampoco se reciben domicilios", async () => {
    await db.exec(`update restaurants set orders_paused = true where id = '${R}'`);
    await expect(pedir({ telefono: "4444-0005" })).rejects.toThrow(/orders_paused/);
    await db.exec(`update restaurants set orders_paused = false where id = '${R}'`);
  });
});
