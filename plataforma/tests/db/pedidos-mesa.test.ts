// Fase 4 (parte A): pedidos de mesa, horario, estados y cierre de cuenta.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { como, crearBaseDeDatos } from "./base-de-datos";

const U = {
  duenoA: "00000000-0000-0000-0000-0000000006a1",
  duenoB: "00000000-0000-0000-0000-0000000006b1",
  mesero: "00000000-0000-0000-0000-0000000006a2", // ver y actualizar, NO aceptar
  cajero: "00000000-0000-0000-0000-0000000006a3", // ver y mesas
};
const R = { a: "10000000-0000-0000-0000-0000000006aa", b: "10000000-0000-0000-0000-0000000006bb", c: "10000000-0000-0000-0000-0000000006cc" };
const CAT = "20000000-0000-0000-0000-0000000006aa";
const CAT_B = "20000000-0000-0000-0000-0000000006bb";
const P = {
  chuleta: "30000000-0000-0000-0000-000000000601",
  agotado: "30000000-0000-0000-0000-000000000602",
  sinPrecio: "30000000-0000-0000-0000-000000000603",
  michelada: "30000000-0000-0000-0000-000000000604",
  deB: "30000000-0000-0000-0000-000000000605",
};
const G = "40000000-0000-0000-0000-000000000601";
const O = { gallo: "50000000-0000-0000-0000-000000000601", cabro: "50000000-0000-0000-0000-000000000602" };
const MESA = "a".repeat(24);
const MESA_B = "b".repeat(24);

let db: PGlite;
let n = 0;
const clave = () => `prueba-clave-${String(++n).padStart(6, "0")}`;

type Creado = { order_number: number; tracking_token: string; total_cents: number };
const pedir = (items: unknown, opciones: { mesa?: string; clave?: string; nombre?: string } = {}) =>
  como<Creado>(db, "anon", null, "select * from create_table_order($1, $2::jsonb, $3, null, $4)",
    [opciones.mesa ?? MESA, JSON.stringify(items), opciones.nombre ?? null, opciones.clave ?? clave()]);

const estado = (actor: string, pedido: string, a: string, version: number, nota: string | null = null) =>
  como<{ v: number }>(db, "authenticated", actor, "select set_order_status($1, $2::order_status, $3, $4) as v", [pedido, a, version, nota]);

const pedidoPorNumero = async (numero: number) =>
  (await como<{ id: string; version: number; table_account_id: string }>(db, "postgres", null,
    "select id, version, table_account_id from orders where restaurant_id = $1 and number = $2", [R.a, numero])).rows[0];

beforeAll(async () => {
  db = await crearBaseDeDatos();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${U.duenoA}', 'a@x.gt'), ('${U.duenoB}', 'b@x.gt'), ('${U.mesero}', 'm@x.gt'), ('${U.cajero}', 'c@x.gt');
    insert into restaurants (id, slug, name, status) values
      ('${R.a}', 'resto-a', 'Resto A', 'active'), ('${R.b}', 'resto-b', 'Resto B', 'active'),
      ('${R.c}', 'resto-c', 'Resto C', 'active');
    insert into memberships (id, restaurant_id, user_id, role) values
      ('60000000-0000-0000-0000-000000000601', '${R.a}', '${U.duenoA}', 'owner'),
      ('60000000-0000-0000-0000-000000000602', '${R.b}', '${U.duenoB}', 'owner'),
      ('60000000-0000-0000-0000-000000000603', '${R.a}', '${U.mesero}', 'staff'),
      ('60000000-0000-0000-0000-000000000604', '${R.a}', '${U.cajero}', 'staff');
    insert into membership_permissions (restaurant_id, membership_id, permission) values
      ('${R.a}', '60000000-0000-0000-0000-000000000603', 'orders.view'),
      ('${R.a}', '60000000-0000-0000-0000-000000000603', 'orders.update'),
      ('${R.a}', '60000000-0000-0000-0000-000000000604', 'orders.view'),
      ('${R.a}', '60000000-0000-0000-0000-000000000604', 'tables.manage');
    insert into categories (id, restaurant_id, name) values ('${CAT}', '${R.a}', 'Carnes'), ('${CAT_B}', '${R.b}', 'Otra');
    insert into products (id, restaurant_id, category_id, name, price_cents, sold_out) values
      ('${P.chuleta}', '${R.a}', '${CAT}', 'Chuleta', 3000, false),
      ('${P.agotado}', '${R.a}', '${CAT}', 'Costilla', 3000, true),
      ('${P.sinPrecio}', '${R.a}', '${CAT}', 'Alitas', null, false),
      ('${P.michelada}', '${R.a}', '${CAT}', 'Michelada', 2000, false),
      ('${P.deB}', '${R.b}', '${CAT_B}', 'De B', 1000, false);
    insert into option_groups (id, restaurant_id, product_id, name, min_select, max_select)
      values ('${G}', '${R.a}', '${P.michelada}', 'Elige tu cerveza', 1, 1);
    insert into options (id, restaurant_id, group_id, name, price_delta_cents) values
      ('${O.gallo}', '${R.a}', '${G}', 'Gallo', 0), ('${O.cabro}', '${R.a}', '${G}', 'Cabro', 500);
    insert into tables (restaurant_id, label, qr_code) values ('${R.a}', 'Mesa 1', '${MESA}'), ('${R.b}', 'Mesa 1', '${MESA_B}');
    -- Resto A atiende todo el día (dos tramos por día para cubrir las 24 h).
    insert into opening_hours (restaurant_id, service, weekday, opens_at, closes_at)
      select '${R.a}', 'dine_in', d, t.o, t.c from generate_series(0, 6) d,
        (values ('00:00'::time, '12:00'::time), ('12:00'::time, '00:00'::time)) t(o, c);
    -- Resto C: solo el lunes de 18:00 a 02:00 (cruza la medianoche).
    insert into opening_hours (restaurant_id, service, weekday, opens_at, closes_at)
      values ('${R.c}', 'dine_in', 1, '18:00', '02:00');
  `);
});

describe("horario", () => {
  const abierto = async (momento: string) =>
    (await como<{ a: boolean }>(db, "postgres", null, "select app.abierto_en($1, 'dine_in', $2::timestamptz) as a", [R.c, momento])).rows[0].a;

  it("respeta la hora de Guatemala y el horario que cruza la medianoche", async () => {
    // Lunes 16-nov-2026. Guatemala = UTC-6.
    expect(await abierto("2026-11-16 17:00-06")).toBe(false);
    expect(await abierto("2026-11-16 20:00-06")).toBe(true);
    expect(await abierto("2026-11-17 01:00-06")).toBe(true); // madrugada del martes
    expect(await abierto("2026-11-17 03:00-06")).toBe(false);
    expect(await abierto("2026-11-17 20:00-06")).toBe(false); // martes en la noche: no atiende
  });

  it("sin horario configurado se considera cerrado", async () => {
    const { rows } = await como<{ a: boolean }>(db, "postgres", null, "select app.abierto_en($1, 'dine_in', now()) as a", [R.b]);
    expect(rows[0].a).toBe(false);
    await expect(pedir([{ product_id: P.deB, quantity: 1 }], { mesa: MESA_B })).rejects.toThrow(/closed/);
  });

  it("solo quien tiene settings.edit cambia el horario, y con datos válidos", async () => {
    const horas = JSON.stringify([{ weekday: 1, opens: "08:00", closes: "16:00" }]);
    await expect(como(db, "authenticated", U.duenoB, "select set_opening_hours($1, 'dine_in', $2::jsonb)", [R.c, horas]))
      .rejects.toThrow(/not_authorized/);
    await expect(como(db, "authenticated", U.duenoA, "select set_opening_hours($1, 'dine_in', $2::jsonb)",
      [R.a, JSON.stringify([{ weekday: 9, opens: "25:00", closes: "16:00" }])])).rejects.toThrow(/invalid_hours/);
  });
});

describe("mesa por código QR", () => {
  it("devuelve la mesa y si se puede pedir; un código falso no devuelve nada", async () => {
    const ok = await como<{ slug: string; label: string; estado: string }>(db, "anon", null, "select * from table_by_qr($1)", [MESA]);
    expect(ok.rows[0]).toEqual({ slug: "resto-a", label: "Mesa 1", estado: "abierto" });
    const falso = await como(db, "anon", null, "select * from table_by_qr($1)", ["c".repeat(24)]);
    expect(falso.rows).toHaveLength(0);
  });

  it("el público no puede listar mesas ni leer pedidos directamente", async () => {
    await expect(como(db, "anon", null, "select * from tables")).rejects.toThrow(/permission denied/);
    await expect(como(db, "anon", null, "select * from orders")).rejects.toThrow(/permission denied/);
  });
});

describe("crear pedido", () => {
  it("calcula el total con los precios de la base e ignora el precio que mande el teléfono", async () => {
    const { rows } = await pedir([
      { product_id: P.chuleta, quantity: 1, price_cents: 1 },
      { product_id: P.michelada, quantity: 2, options: [O.cabro], notes: "  bien fría " },
    ], { nombre: "Ana" });
    expect(rows[0]).toMatchObject({ order_number: 1, total_cents: 3000 + 2 * 2500 });
    expect(rows[0].tracking_token).toMatch(/^[0-9a-f]{32}$/);
    const items = await como<{ product_name: string; unit_price_cents: number; notes: string | null }>(db, "postgres", null,
      "select product_name, unit_price_cents, notes from order_items order by product_name");
    expect(items.rows).toEqual([
      { product_name: "Chuleta", unit_price_cents: 3000, notes: null },
      { product_name: "Michelada", unit_price_cents: 2500, notes: "bien fría" },
    ]);
  });

  it("tocar dos veces (misma clave) no duplica el pedido", async () => {
    const k = clave();
    const a = await pedir([{ product_id: P.chuleta, quantity: 1 }], { clave: k });
    const b = await pedir([{ product_id: P.chuleta, quantity: 5 }], { clave: k });
    expect(b.rows[0]).toEqual(a.rows[0]);
    const { rows } = await como<{ c: number }>(db, "postgres", null, "select count(*)::int c from orders where idempotency_key = $1", [k]);
    expect(rows[0].c).toBe(1);
  });

  it("rechaza productos agotados, sin precio o de otro restaurante", async () => {
    await expect(pedir([{ product_id: P.agotado, quantity: 1 }])).rejects.toThrow(/product_unavailable/);
    await expect(pedir([{ product_id: P.sinPrecio, quantity: 1 }])).rejects.toThrow(/product_unavailable/);
    await expect(pedir([{ product_id: P.deB, quantity: 1 }])).rejects.toThrow(/product_unavailable/);
    await expect(pedir([{ product_id: "no-es-uuid", quantity: 1 }])).rejects.toThrow(/product_unavailable/);
  });

  it("exige las opciones obligatorias y solo opciones de ese producto", async () => {
    await expect(pedir([{ product_id: P.michelada, quantity: 1 }])).rejects.toThrow(/invalid_options/);
    await expect(pedir([{ product_id: P.michelada, quantity: 1, options: [O.gallo, O.cabro] }])).rejects.toThrow(/invalid_options/);
    await expect(pedir([{ product_id: P.chuleta, quantity: 1, options: [O.gallo] }])).rejects.toThrow(/invalid_options/);
  });

  it("rechaza cantidades y listas inválidas", async () => {
    await expect(pedir([{ product_id: P.chuleta, quantity: 0 }])).rejects.toThrow(/invalid_items/);
    await expect(pedir([{ product_id: P.chuleta, quantity: 21 }])).rejects.toThrow(/invalid_items/);
    await expect(pedir([{ product_id: P.chuleta, quantity: "1; drop" }])).rejects.toThrow(/invalid_items/);
    await expect(pedir([])).rejects.toThrow(/invalid_items/);
    await expect(pedir({ product_id: P.chuleta })).rejects.toThrow(/invalid_items/);
  });

  it("con los pedidos en pausa no se aceptan pedidos", async () => {
    await db.exec(`update restaurants set orders_paused = true where id = '${R.a}'`);
    await expect(pedir([{ product_id: P.chuleta, quantity: 1 }])).rejects.toThrow(/orders_paused/);
    await db.exec(`update restaurants set orders_paused = false where id = '${R.a}'`);
  });

  it("varios teléfonos en la misma mesa suman a la misma cuenta", async () => {
    const uno = await pedidoPorNumero(1);
    const dos = await pedidoPorNumero(2);
    expect(dos.table_account_id).toBe(uno.table_account_id);
    const { rows } = await pedir([{ product_id: P.chuleta, quantity: 1 }]);
    const seguimiento = await como<{ d: { table: string; account: { total_cents: number; orders: unknown[] } } }>(db, "anon", null,
      "select order_by_token($1) as d", [rows[0].tracking_token]);
    expect(seguimiento.rows[0].d.table).toBe("Mesa 1");
    expect(seguimiento.rows[0].d.account.orders).toHaveLength(3);
    expect(seguimiento.rows[0].d.account.total_cents).toBe(8000 + 3000 + 3000);
  });

  it("el seguimiento no responde a un código inventado", async () => {
    const { rows } = await como<{ d: unknown }>(db, "anon", null, "select order_by_token($1) as d", ["0".repeat(32)]);
    expect(rows[0].d).toBeNull();
  });
});

describe("estado del pedido", () => {
  it("aceptar exige orders.accept; otro restaurante no puede tocarlo", async () => {
    const p = await pedidoPorNumero(1);
    await expect(estado(U.mesero, p.id, "aceptado", p.version)).rejects.toThrow(/not_authorized/);
    await expect(estado(U.duenoB, p.id, "aceptado", p.version)).rejects.toThrow(/not_authorized/);
    const { rows } = await estado(U.duenoA, p.id, "aceptado", p.version);
    expect(rows[0].v).toBe(p.version + 1);
  });

  it("si otra persona ya lo cambió, se rechaza (versión vieja)", async () => {
    const p = await pedidoPorNumero(1);
    await expect(estado(U.mesero, p.id, "listo", p.version - 1)).rejects.toThrow(/order_changed/);
  });

  it("el mesero avanza el pedido pero no puede regresarlo ni cancelarlo sin permiso", async () => {
    const p = await pedidoPorNumero(1);
    await estado(U.mesero, p.id, "listo", p.version);
    await expect(estado(U.mesero, p.id, "en_preparacion", p.version + 1)).rejects.toThrow(/invalid_transition/);
    await expect(estado(U.mesero, p.id, "cancelado", p.version + 1, "Cliente se fue")).rejects.toThrow(/not_authorized/);
  });

  it("cancelar exige un motivo", async () => {
    const p = await pedidoPorNumero(2);
    await expect(estado(U.duenoA, p.id, "cancelado", p.version)).rejects.toThrow(/reason_required/);
    await estado(U.duenoA, p.id, "cancelado", p.version, "Se pidió por error");
    const ev = await como<{ note: string }>(db, "authenticated", U.duenoA,
      "select note from order_events where order_id = $1 and to_status = 'cancelado'", [p.id]);
    expect(ev.rows[0].note).toBe("Se pidió por error");
  });
});

describe("cerrar cuenta (efectivo)", () => {
  it("no se cierra con pedidos pendientes ni con un total distinto al que vio el empleado", async () => {
    const p = await pedidoPorNumero(1);
    await expect(como(db, "authenticated", U.cajero, "select close_table_account($1, 0)", [p.table_account_id]))
      .rejects.toThrow(/account_has_pending_orders/);

    // Entrega lo que falta.
    for (const numero of [1, 3]) {
      let q = await pedidoPorNumero(numero);
      if (numero === 3) { await estado(U.duenoA, q.id, "aceptado", q.version); q = await pedidoPorNumero(numero); }
      await estado(U.duenoA, q.id, "entregado", q.version);
    }
    const otros = await como<{ id: string; version: number }>(db, "postgres", null,
      "select id, version from orders where table_account_id = $1 and status not in ('entregado','cancelado')", [p.table_account_id]);
    for (const o of otros.rows) {
      await estado(U.duenoA, o.id, "cancelado", o.version, "Limpieza de prueba");
    }

    await expect(como(db, "authenticated", U.mesero, "select close_table_account($1, 1)", [p.table_account_id]))
      .rejects.toThrow(/not_authorized/);
    await expect(como(db, "authenticated", U.cajero, "select close_table_account($1, 1)", [p.table_account_id]))
      .rejects.toThrow(/total_changed/);
  });

  it("el cajero cierra con el total correcto y queda registrado el cobro", async () => {
    const p = await pedidoPorNumero(1);
    const { rows } = await como<{ t: number }>(db, "postgres", null,
      "select sum(total_cents)::int t from orders where table_account_id = $1 and status <> 'cancelado'", [p.table_account_id]);
    await como(db, "authenticated", U.cajero, "select close_table_account($1, $2)", [p.table_account_id, rows[0].t]);
    const pago = await como<{ amount_cents: number; received_by: string }>(db, "postgres", null,
      "select amount_cents, received_by from cash_payments where table_account_id = $1", [p.table_account_id]);
    expect(pago.rows[0]).toEqual({ amount_cents: rows[0].t, received_by: U.cajero });
  });

  it("después de cerrar, el siguiente pedido abre una cuenta nueva", async () => {
    const viejo = await pedidoPorNumero(1);
    const { rows } = await pedir([{ product_id: P.chuleta, quantity: 1 }]);
    const nuevo = await pedidoPorNumero(rows[0].order_number);
    expect(nuevo.table_account_id).not.toBe(viejo.table_account_id);
  });
});
