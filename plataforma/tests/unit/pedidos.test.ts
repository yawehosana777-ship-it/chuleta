// Fase 4 (parte A): reglas de pedidos que usa la aplicación antes de llegar a la base.
import { describe, expect, it } from "vitest";
import { crearLinea } from "@/lib/menu/carrito";
import type { Producto } from "@/lib/menu/tipos";
import {
  articulosParaBase, esquemaPedidoDomicilio, esquemaPedidoMesa, estadoCliente, leerHorario, limiteAtraso, mensajeError, notasDomicilio,
  siguientesPasos,
} from "@/lib/pedidos";
import type { Permiso } from "@/lib/permisos";

const conPermisos = (...p: Permiso[]) => (x: Permiso) => p.includes(x);
const ID = "30000000-0000-4000-8000-000000000601";

describe("pasos del pedido en el panel", () => {
  it("un pedido nuevo solo se puede aceptar con el permiso de aceptar", () => {
    expect(siguientesPasos("nuevo", conPermisos("orders.update"))).toEqual([]);
    expect(siguientesPasos("nuevo", conPermisos("orders.accept")).map((s) => s.a)).toEqual(["aceptado"]);
  });

  it("después de aceptado solo avanza, nunca regresa", () => {
    const puede = conPermisos("orders.update");
    expect(siguientesPasos("aceptado", puede).map((s) => s.a)).toEqual(["en_preparacion", "listo"]);
    expect(siguientesPasos("listo", puede).map((s) => s.a)).toEqual(["entregado"]);
    expect(siguientesPasos("entregado", puede)).toEqual([]);
    expect(siguientesPasos("cancelado", puede)).toEqual([]);
  });
});

describe("lo que manda el teléfono", () => {
  const valido = {
    mesa: "a".repeat(24), clave: "c".repeat(36), nombre: " Ana ", notas: "",
    lineas: [{ productoId: ID, cantidad: 2, opciones: [], nota: " sin cebolla " }],
  };

  it("acepta un pedido válido y NO envía precios a la base", () => {
    const d = esquemaPedidoMesa.parse(valido);
    expect(d.nombre).toBe("Ana");
    const items = articulosParaBase(d.lineas);
    expect(items).toEqual([{ product_id: ID, quantity: 2, options: [], notes: "sin cebolla" }]);
    expect(JSON.stringify(items)).not.toMatch(/price/);
  });

  it("rechaza mesa falsa, cantidades fuera de rango y pedidos vacíos", () => {
    expect(esquemaPedidoMesa.safeParse({ ...valido, mesa: "../../x" }).success).toBe(false);
    expect(esquemaPedidoMesa.safeParse({ ...valido, lineas: [{ ...valido.lineas[0], cantidad: 21 }] }).success).toBe(false);
    expect(esquemaPedidoMesa.safeParse({ ...valido, lineas: [] }).success).toBe(false);
    expect(esquemaPedidoMesa.safeParse({ ...valido, clave: "corta" }).success).toBe(false);
  });
});

describe("carrito con observaciones", () => {
  const p: Producto = {
    id: ID, nombre: "Chuleta", descripcion: null, precio: 3000, agotado: false, destacado: false, imagen: null, grupos: [],
    descuento: 0, promocion: null, etiquetaPromocion: null,
  };

  it("la misma comida con observaciones distintas son líneas distintas", () => {
    const a = crearLinea(p, {}, 1, "sin cebolla")!;
    const b = crearLinea(p, {}, 1, "")!;
    expect(a.clave).not.toBe(b.clave);
    expect(a.nota).toBe("sin cebolla");
  });
});

describe("horario del formulario", () => {
  const form = (campos: Record<string, string>) => {
    const f = new FormData();
    Object.entries(campos).forEach(([k, v]) => f.set(k, v));
    return f;
  };

  it("solo guarda los días marcados, con horas válidas", () => {
    const { horas, errores } = leerHorario(form({ "abre-1": "on", "desde-1": "18:00", "hasta-1": "02:00", "desde-2": "09:00", "hasta-2": "10:00" }));
    expect(horas).toEqual([{ weekday: 1, opens: "18:00", closes: "02:00" }]);
    expect(errores).toEqual({});
  });

  it("marca el día si falta una hora o son iguales", () => {
    const { horas, errores } = leerHorario(form({ "abre-3": "on", "desde-3": "10:00", "hasta-3": "10:00", "abre-4": "on", "desde-4": "10:00" }));
    expect(horas).toEqual([]);
    expect(Object.keys(errores)).toEqual(["dia-3", "dia-4"]);
  });
});

describe("pedido a domicilio", () => {
  const base = {
    slug: "don-chuleta", clave: "d".repeat(36), nombre: "Ana", telefono: "+502 5555 1234", direccion: "Barrio El Centro, casa 12",
    referencias: "", pagaCon: "100", notas: "Tocar el timbre", enZona: true as const,
    lineas: [{ productoId: ID, cantidad: 1, opciones: [] }],
  };

  it("normaliza el teléfono y pone el monto de pago en las notas", () => {
    const d = esquemaPedidoDomicilio.parse(base);
    expect(d.telefono).toBe("5555-1234");
    expect(notasDomicilio(d)).toBe("Paga con Q 100 · Tocar el timbre");
  });

  it("exige confirmar la zona, un teléfono válido y la dirección", () => {
    expect(esquemaPedidoDomicilio.safeParse({ ...base, enZona: false }).success).toBe(false);
    expect(esquemaPedidoDomicilio.safeParse({ ...base, telefono: "1234" }).success).toBe(false);
    expect(esquemaPedidoDomicilio.safeParse({ ...base, direccion: "" }).success).toBe(false);
  });

  it("en domicilio, 'listo' se le dice al cliente como 'va en camino'", () => {
    expect(estadoCliente("listo", "delivery")).toMatch(/camino/);
    expect(estadoCliente("listo", "dine_in")).toMatch(/mesa/);
  });
});

describe("avisos de atraso", () => {
  const limites = { aceptar: 5, preparar: 25 };
  it("nuevo usa el límite para aceptar; aceptado/en preparación el de tenerlo listo; listo no se atrasa", () => {
    expect(limiteAtraso("nuevo", limites)).toBe(5);
    expect(limiteAtraso("aceptado", limites)).toBe(25);
    expect(limiteAtraso("en_preparacion", limites)).toBe(25);
    expect(limiteAtraso("listo", limites)).toBeNull();
    expect(limiteAtraso("entregado", limites)).toBeNull();
  });
});

describe("mensajes de error", () => {
  it("traduce los errores de la base y no muestra textos técnicos", () => {
    expect(mensajeError('new row ... "orders_paused"')).toMatch(/pausó/);
    expect(mensajeError("algo raro de postgres")).toBe("No se pudo completar. Inténtalo de nuevo.");
  });
});
