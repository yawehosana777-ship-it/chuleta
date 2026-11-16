// Descuentos de las promociones, para MOSTRARLOS en el menú. Es la misma regla
// que usa la base de datos (app.descuento_unitario), que es la que cobra:
//   * porcentaje o monto fijo sobre el precio del producto (no sobre extras);
//   * nunca más que el precio (no hay precios negativos);
//   * varias promociones: la que más descuenta; las "acumulables" se suman
//     entre sí y se usa la suma solo si da más.

export type FilaPromocion = {
  name: string;
  kind: string;
  value: number | null;
  stackable: boolean;
  promotion_items: { product_id: string | null; category_id: string | null }[];
};

export type Descuento = { descuento: number; nombre: string | null; etiqueta: string | null };

const montoDe = (p: FilaPromocion, base: number) =>
  p.kind === "percent" ? Math.floor((base * (p.value ?? 0) + 50) / 100) : Math.min(p.value ?? 0, base);

/** Descuento por unidad de un producto según las promociones vigentes. */
export function descuentoUnitario(base: number, productoId: string, categoriaId: string, promociones: FilaPromocion[]): Descuento {
  const vigentes = promociones
    .filter((p) => (p.kind === "percent" || p.kind === "fixed") && (p.value ?? 0) > 0)
    .filter((p) => p.promotion_items.some((i) => i.product_id === productoId || i.category_id === categoriaId))
    .map((p) => ({ p, d: montoDe(p, base) }))
    .sort((a, b) => b.d - a.d || a.p.name.localeCompare(b.p.name));
  if (!vigentes.length) return { descuento: 0, nombre: null, etiqueta: null };

  const mejor = vigentes[0];
  const acumulables = vigentes.filter((v) => v.p.stackable);
  const suma = acumulables.reduce((s, v) => s + v.d, 0);
  const usarSuma = suma > mejor.d;
  const descuento = Math.min(base, usarSuma ? suma : mejor.d);
  if (descuento <= 0) return { descuento: 0, nombre: null, etiqueta: null };

  const nombre = usarSuma ? acumulables.map((v) => v.p.name).sort().join(" + ") : mejor.p.name;
  const etiqueta = !usarSuma && mejor.p.kind === "percent" ? `-${mejor.p.value}%` : "Promo";
  return { descuento, nombre, etiqueta };
}
