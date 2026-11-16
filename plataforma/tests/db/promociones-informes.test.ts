// Fase 6: promociones (calculadas en la base) e informe de ventas.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { como, crearBaseDeDatos } from "./base-de-datos";

const U = {
  dueno: "00000000-0000-0000-0000-0000000009a1",
  contador: "00000000-0000-0000-0000-0000000009a2", // solo reports.view
  mesero: "00000000-0000-0000-0000-0000000009a3",   // sin permisos de menú ni informes
  duenoB: "00000000-0000-0000-0000-0000000009b1",
};
const R = { a: "10000000-0000-0000-0000-0000000009aa", b: "10000000-0000-0000-0000-0000000009bb" };
const CAT = { carnes: "20000000-0000-0000-0000-000000000901", cervezas: "20000000-0000-0000-0000-000000000902", b: "20000000-0000-0000-0000-000000000903" };
const P = {
  chuleta: "30000000-0000-0000-0000-000000000901",
  coronita: "30000000-0000-0000-0000-000000000902",
  michelada: "30000000-0000-0000-0000-000000000903",
  deB: "30000000-0000-0000-0000-000000000904",
};
const OPC_CABRO = "50000000-0000-0000-0000-000000000901";
const MESA = "c".repeat(24);

let db: PGlite;
let n = 0;

type Item = { product_id: string; quantity: number; options?: string[] };
const pedir = async (items: Item[]) => {
  const { rows } = await como<{ order_number: number; total_cents: number }>(db, "anon", null,
    "select * from create_table_order($1, $2::jsonb, null, null, $3)", [MESA, JSON.stringify(items), `promo-clave-${String(++n).padStart(6, "0")}`]);
  const o = await como<{ subtotal_cents: number; discount_cents: number; total_cents: number }>(db, "postgres", null,
    "select subtotal_cents, discount_cents, total_cents from orders where restaurant_id = $1 and number = $2", [R.a, rows[0].order_number]);
  const lineas = await como<{ product_name: string; discount_cents: number; promotion: string | null; line_total_cents: number }>(db, "postgres", null,
    `select i.product_name, i.discount_cents, i.promotion, i.line_total_cents from order_items i join orders o on o.id = i.order_id
     where o.restaurant_id = $1 and o.number = $2 order by i.product_name`, [R.a, rows[0].order_number]);
  return { numero: rows[0].order_number, ...o.rows[0], lineas: lineas.rows };
};

/** Crea una promoción directamente (para probar el cálculo). */
const promo = (nombre: string, tipo: "percent" | "fixed", valor: number, a: { producto?: string; categoria?: string },
  extra: { acumulable?: boolean; activa?: boolean; desde?: string; hasta?: string } = {}) =>
  db.exec(`
    with p as (insert into promotions (restaurant_id, name, kind, value, stackable, active, starts_at, ends_at)
      values ('${R.a}', '${nombre}', '${tipo}', ${valor}, ${extra.acumulable ?? false}, ${extra.activa ?? true},
              ${extra.desde ? `now() + interval '${extra.desde}'` : "null"}, ${extra.hasta ? `now() + interval '${extra.hasta}'` : "null"})
      returning id)
    insert into promotion_items (restaurant_id, promotion_id, product_id, category_id)
      select '${R.a}', id, ${a.producto ? `'${a.producto}'` : "null"}, ${a.categoria ? `'${a.categoria}'` : "null"} from p;`);

beforeAll(async () => {
  db = await crearBaseDeDatos();
  await db.exec(`
    insert into auth.users (id, email) values ('${U.dueno}', 'd@x.gt'), ('${U.contador}', 'c@x.gt'), ('${U.mesero}', 'm@x.gt'), ('${U.duenoB}', 'b@x.gt');
    insert into restaurants (id, slug, name, status) values ('${R.a}', 'resto-promo', 'Resto Promo', 'active'), ('${R.b}', 'resto-otro', 'Otro', 'active');
    insert into memberships (id, restaurant_id, user_id, role) values
      ('60000000-0000-0000-0000-000000000901', '${R.a}', '${U.dueno}', 'owner'),
      ('60000000-0000-0000-0000-000000000902', '${R.a}', '${U.contador}', 'staff'),
      ('60000000-0000-0000-0000-000000000903', '${R.a}', '${U.mesero}', 'staff'),
      ('60000000-0000-0000-0000-000000000904', '${R.b}', '${U.duenoB}', 'owner');
    insert into membership_permissions (restaurant_id, membership_id, permission) values
      ('${R.a}', '60000000-0000-0000-0000-000000000902', 'reports.view'),
      ('${R.a}', '60000000-0000-0000-0000-000000000903', 'orders.view');
    insert into categories (id, restaurant_id, name) values
      ('${CAT.carnes}', '${R.a}', 'Carnes'), ('${CAT.cervezas}', '${R.a}', 'Cervezas'), ('${CAT.b}', '${R.b}', 'De B');
    insert into products (id, restaurant_id, category_id, name, price_cents) values
      ('${P.chuleta}', '${R.a}', '${CAT.carnes}', 'Chuleta', 3000),
      ('${P.coronita}', '${R.a}', '${CAT.cervezas}', 'Coronitas', 700),
      ('${P.michelada}', '${R.a}', '${CAT.cervezas}', 'Michelada', 2000),
      ('${P.deB}', '${R.b}', '${CAT.b}', 'De B', 1000);
    insert into option_groups (id, restaurant_id, product_id, name, min_select, max_select)
      values ('40000000-0000-0000-0000-000000000901', '${R.a}', '${P.michelada}', 'Cerveza', 1, 1);
    insert into options (id, restaurant_id, group_id, name, price_delta_cents) values
      ('${OPC_CABRO}', '${R.a}', '40000000-0000-0000-0000-000000000901', 'Cabro', 500);
    insert into tables (restaurant_id, label, qr_code) values ('${R.a}', 'Mesa 1', '${MESA}');
    insert into opening_hours (restaurant_id, service, weekday, opens_at, closes_at)
      select '${R.a}', 'dine_in', d, t.o, t.c from generate_series(0, 6) d,
        (values ('00:00'::time, '12:00'::time), ('12:00'::time, '00:00'::time)) t(o, c);
  `);
});

describe("cálculo de descuentos (en la base de datos)", () => {
  beforeEach(async () => { await db.exec(`delete from promotions where restaurant_id = '${R.a}'`); });

  it("porcentaje: 20% en Chuleta", async () => {
    await promo("Martes de chuleta", "percent", 20, { producto: P.chuleta });
    const p = await pedir([{ product_id: P.chuleta, quantity: 2 }]);
    expect(p).toMatchObject({ subtotal_cents: 6000, discount_cents: 1200, total_cents: 4800 });
    expect(p.lineas[0]).toEqual({ product_name: "Chuleta", discount_cents: 1200, promotion: "Martes de chuleta", line_total_cents: 4800 });
  });

  it("un monto mayor que el precio nunca deja el precio negativo", async () => {
    await promo("Regalo", "fixed", 5000, { producto: P.coronita });
    const p = await pedir([{ product_id: P.coronita, quantity: 3 }]);
    expect(p).toMatchObject({ subtotal_cents: 2100, discount_cents: 2100, total_cents: 0 });
    expect(p.lineas[0].line_total_cents).toBe(0);
  });

  it("dos promociones normales: se aplica solo la que más descuenta", async () => {
    await promo("Carnes 10%", "percent", 10, { categoria: CAT.carnes });
    await promo("Chuleta 20%", "percent", 20, { producto: P.chuleta });
    const p = await pedir([{ product_id: P.chuleta, quantity: 1 }]);
    expect(p.discount_cents).toBe(600);
    expect(p.lineas[0].promotion).toBe("Chuleta 20%");
  });

  it("solo las acumulables se suman, y nunca pasan del precio", async () => {
    await promo("Carnes 10%", "percent", 10, { categoria: CAT.carnes }, { acumulable: true });
    await promo("Chuleta 20%", "percent", 20, { producto: P.chuleta }, { acumulable: true });
    const p = await pedir([{ product_id: P.chuleta, quantity: 1 }]);
    expect(p.discount_cents).toBe(900);
    expect(p.lineas[0].promotion).toBe("Carnes 10% + Chuleta 20%");

    await promo("Mitad", "percent", 60, { producto: P.chuleta }, { acumulable: true });
    const tope = await pedir([{ product_id: P.chuleta, quantity: 1 }]);
    expect(tope.discount_cents).toBe(2700); // 10% + 20% + 60% = 90%, menos que el precio
    await promo("Otra", "percent", 50, { producto: P.chuleta }, { acumulable: true });
    const sinNegativos = await pedir([{ product_id: P.chuleta, quantity: 1 }]);
    expect(sinNegativos.total_cents).toBe(0); // 140% → se queda en el precio, no en negativo
  });

  it("el descuento es sobre el precio del producto, no sobre los extras", async () => {
    await promo("Micheladas 50%", "percent", 50, { producto: P.michelada });
    const p = await pedir([{ product_id: P.michelada, quantity: 1, options: [OPC_CABRO] }]);
    expect(p).toMatchObject({ subtotal_cents: 2500, discount_cents: 1000, total_cents: 1500 });
  });

  it("no aplica promociones vencidas, futuras ni pausadas", async () => {
    await promo("Vencida", "percent", 50, { producto: P.chuleta }, { hasta: "-1 hour" });
    await promo("Futura", "percent", 50, { producto: P.chuleta }, { desde: "1 day" });
    await promo("Pausada", "percent", 50, { producto: P.chuleta }, { activa: false });
    const p = await pedir([{ product_id: P.chuleta, quantity: 1 }]);
    expect(p).toMatchObject({ discount_cents: 0, total_cents: 3000 });
  });
});

describe("guardar promociones desde el panel", () => {
  const guardar = (actor: string, opciones: { restaurante?: string; valor?: number; productos?: string[]; categorias?: string[]; desde?: string; hasta?: string } = {}) =>
    como<{ id: string }>(db, "authenticated", actor,
      "select save_promotion($1, null, 'Promo', 'percent', $2, $3, $4, false, true, $5::uuid[], $6::uuid[]) as id",
      [opciones.restaurante ?? R.a, opciones.valor ?? 10, opciones.desde ?? "", opciones.hasta ?? "",
       `{${(opciones.productos ?? [P.chuleta]).join(",")}}`, `{${(opciones.categorias ?? []).join(",")}}`]);

  it("solo quien edita el menú de ESE restaurante", async () => {
    await expect(guardar(U.mesero)).rejects.toThrow(/not_authorized/);
    await expect(guardar(U.duenoB)).rejects.toThrow(/not_authorized/);
  });

  it("valida porcentaje, fechas y que tenga productos", async () => {
    await expect(guardar(U.dueno, { valor: 0 })).rejects.toThrow(/invalid_promotion/);
    await expect(guardar(U.dueno, { valor: 101 })).rejects.toThrow(/invalid_promotion/);
    await expect(guardar(U.dueno, { productos: [] })).rejects.toThrow(/promotion_without_items/);
    await expect(guardar(U.dueno, { desde: "2026-11-20T18:00", hasta: "2026-11-20T10:00" })).rejects.toThrow(/invalid_dates/);
    await expect(guardar(U.dueno, { desde: "mañana" })).rejects.toThrow(/invalid_dates/);
  });

  it("no puede incluir productos de otro restaurante", async () => {
    await expect(guardar(U.dueno, { productos: [P.deB] })).rejects.toThrow(/foreign key|violates/);
  });

  it("guarda las fechas en hora de Guatemala", async () => {
    const { rows } = await guardar(U.dueno, { desde: "2026-11-20T18:00", hasta: "2026-11-21T02:00" });
    const p = await como<{ s: string; e: string }>(db, "postgres", null,
      "select to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') s, to_char(ends_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') e from promotions where id = $1", [rows[0].id]);
    expect(p.rows[0]).toEqual({ s: "2026-11-21 00:00", e: "2026-11-21 08:00" });
  });
});

describe("informe de ventas", () => {
  const hoy = async () => (await como<{ d: string }>(db, "postgres", null,
    "select to_char((now() at time zone 'America/Guatemala')::date, 'YYYY-MM-DD') d")).rows[0].d;
  const estado = (id: string, a: string, v: number, nota: string | null = null) =>
    como(db, "authenticated", U.dueno, "select set_order_status($1, $2::order_status, $3, $4)", [id, a, v, nota]);

  it("separa registrados, entregados, cancelados y cobrados", async () => {
    await db.exec(`delete from promotions where restaurant_id = '${R.a}';
                   delete from cash_payments where restaurant_id = '${R.a}';
                   delete from orders where restaurant_id = '${R.a}';
                   delete from table_accounts where restaurant_id = '${R.a}';`);
    await promo("Chuleta 10%", "percent", 10, { producto: P.chuleta });
    const a = await pedir([{ product_id: P.chuleta, quantity: 2 }]);    // 6000 - 600 = 5400 → entregado
    const b = await pedir([{ product_id: P.coronita, quantity: 1 }]);   // 700 → cancelado
    await pedir([{ product_id: P.coronita, quantity: 2 }]);             // 1400 → sigue en curso
    const id = async (numero: number) => (await como<{ id: string; table_account_id: string }>(db, "postgres", null,
      "select id, table_account_id from orders where restaurant_id = $1 and number = $2", [R.a, numero])).rows[0];
    const pa = await id(a.numero);
    await estado(pa.id, "aceptado", 1);
    await estado(pa.id, "entregado", 2);
    await estado((await id(b.numero)).id, "cancelado", 1, "Prueba de informe");

    const d = await hoy();
    await expect(como(db, "authenticated", U.mesero, "select sales_report($1, $2::date, $3::date)", [R.a, d, d])).rejects.toThrow(/not_authorized/);
    const { rows } = await como<{ r: Record<string, unknown> }>(db, "authenticated", U.contador,
      "select sales_report($1, $2::date, $3::date) as r", [R.a, d, d]);
    expect(rows[0].r).toMatchObject({
      registrados: 3, entregados: 1, cancelados: 1, en_curso: 1,
      ventas_cents: 5400, descuentos_cents: 600, cancelado_cents: 700, cobrado_cents: 0,
      mas_vendidos: [{ nombre: "Chuleta", cantidad: 2, ventas_cents: 5400 }],
    });
    expect((rows[0].r.por_dia as { dia: string; registrados: number }[])).toEqual([
      expect.objectContaining({ dia: d, registrados: 3, entregados: 1, cancelados: 1, ventas_cents: 5400 }),
    ]);
  });

  it("rechaza rangos inválidos", async () => {
    await expect(como(db, "authenticated", U.dueno, "select sales_report($1, '2026-11-10', '2026-11-01')", [R.a])).rejects.toThrow(/invalid_request/);
    await expect(como(db, "authenticated", U.dueno, "select sales_report($1, '2024-01-01', '2026-01-01')", [R.a])).rejects.toThrow(/invalid_request/);
  });
});
