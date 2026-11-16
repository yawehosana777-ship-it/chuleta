// Fase 6: el menú debe mostrar el MISMO descuento que cobra la base de datos
// (los mismos casos que tests/db/promociones-informes.test.ts).
import { describe, expect, it } from "vitest";
import { crearLinea } from "@/lib/menu/carrito";
import { descuentoUnitario, type FilaPromocion } from "@/lib/menu/promociones";
import type { Producto } from "@/lib/menu/tipos";

const CHULETA = "p-chuleta";
const CARNES = "c-carnes";
const promo = (name: string, kind: "percent" | "fixed", value: number, a: { producto?: string; categoria?: string }, stackable = false): FilaPromocion =>
  ({ name, kind, value, stackable, promotion_items: [{ product_id: a.producto ?? null, category_id: a.categoria ?? null }] });

describe("descuento que se muestra en el menú", () => {
  it("porcentaje y etiqueta", () => {
    expect(descuentoUnitario(3000, CHULETA, CARNES, [promo("Martes", "percent", 20, { producto: CHULETA })]))
      .toEqual({ descuento: 600, nombre: "Martes", etiqueta: "-20%" });
  });

  it("monto fijo nunca deja el precio negativo", () => {
    expect(descuentoUnitario(700, CHULETA, CARNES, [promo("Regalo", "fixed", 5000, { producto: CHULETA })]).descuento).toBe(700);
  });

  it("sin acumulables: la mejor; con acumulables: la suma si es mayor, con tope en el precio", () => {
    const normales = [promo("Carnes 10%", "percent", 10, { categoria: CARNES }), promo("Chuleta 20%", "percent", 20, { producto: CHULETA })];
    expect(descuentoUnitario(3000, CHULETA, CARNES, normales)).toMatchObject({ descuento: 600, nombre: "Chuleta 20%" });
    const acumulables = normales.map((p) => ({ ...p, stackable: true }));
    expect(descuentoUnitario(3000, CHULETA, CARNES, acumulables)).toMatchObject({ descuento: 900, nombre: "Carnes 10% + Chuleta 20%", etiqueta: "Promo" });
    const exceso = [...acumulables, promo("Otra", "percent", 90, { producto: CHULETA }, true)];
    expect(descuentoUnitario(3000, CHULETA, CARNES, exceso).descuento).toBe(3000);
  });

  it("productos sin promoción no cambian", () => {
    expect(descuentoUnitario(3000, "otro", "otra", [promo("Martes", "percent", 20, { producto: CHULETA })]).descuento).toBe(0);
  });

  it("el carrito cobra el precio con descuento y no descuenta los extras", () => {
    const p: Producto = {
      id: CHULETA, nombre: "Michelada", descripcion: null, precio: 2000, agotado: false, destacado: false, imagen: null,
      descuento: 1000, promocion: "Mitad", etiquetaPromocion: "-50%",
      grupos: [{ id: "g", nombre: "Cerveza", min: 1, max: 1, opciones: [{ id: "o", nombre: "Cabro", extra: 500 }] }],
    };
    expect(crearLinea(p, { g: ["o"] }, 1)!.precioUnitario).toBe(1500);
  });
});
