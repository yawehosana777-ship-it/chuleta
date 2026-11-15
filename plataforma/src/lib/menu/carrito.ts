// Cálculos del carrito del cliente. Solo sirven para MOSTRAR totales:
// cuando existan los pedidos en línea (Fase 4), el servidor recalcula todo
// con los precios de la base de datos e ignora lo que mande el navegador.
import type { GrupoOpciones, Producto } from "./tipos";

/** Opciones elegidas: id del grupo → ids de las opciones. */
export type Eleccion = Record<string, string[]>;

export type LineaCarrito = {
  clave: string;
  productoId: string;
  nombre: string;
  detalle: string[];
  precioUnitario: number;
  cantidad: number;
};

export const CANTIDAD_MAXIMA = 20;

export function seleccionInicial(grupos: GrupoOpciones[]): Eleccion {
  return Object.fromEntries(grupos.map((g) => [g.id, g.min > 0 ? g.opciones.slice(0, g.min).map((o) => o.id) : []]));
}

/** Marca o desmarca una opción respetando el máximo del grupo. */
export function alternarOpcion(eleccion: Eleccion, grupo: GrupoOpciones, opcionId: string): Eleccion {
  const actual = eleccion[grupo.id] ?? [];
  let siguiente: string[];
  if (grupo.max === 1) siguiente = [opcionId];
  else if (actual.includes(opcionId)) siguiente = actual.filter((id) => id !== opcionId);
  else if (actual.length < grupo.max) siguiente = [...actual, opcionId];
  else siguiente = actual;
  return { ...eleccion, [grupo.id]: siguiente };
}

export function eleccionCompleta(grupos: GrupoOpciones[], eleccion: Eleccion) {
  return grupos.every((g) => {
    const n = (eleccion[g.id] ?? []).length;
    return n >= g.min && n <= g.max;
  });
}

export function sePuedePedir(p: Producto) {
  return p.precio !== null && !p.agotado;
}

export function crearLinea(p: Producto, eleccion: Eleccion, cantidad: number): LineaCarrito | null {
  if (!sePuedePedir(p) || !eleccionCompleta(p.grupos, eleccion)) return null;
  const elegidas = p.grupos.flatMap((g) => g.opciones.filter((o) => (eleccion[g.id] ?? []).includes(o.id)));
  const ids = elegidas.map((o) => o.id).sort();
  return {
    clave: [p.id, ...ids].join("|"),
    productoId: p.id,
    nombre: p.nombre,
    detalle: elegidas.map((o) => o.nombre),
    precioUnitario: p.precio! + elegidas.reduce((s, o) => s + o.extra, 0),
    cantidad: Math.min(Math.max(1, Math.trunc(cantidad)), CANTIDAD_MAXIMA),
  };
}

/** Agrega una línea; si ya existe la misma combinación, suma la cantidad. */
export function agregarLinea(lineas: LineaCarrito[], nueva: LineaCarrito): LineaCarrito[] {
  const existe = lineas.find((l) => l.clave === nueva.clave);
  if (!existe) return [...lineas, nueva];
  return lineas.map((l) =>
    l.clave === nueva.clave ? { ...l, cantidad: Math.min(l.cantidad + nueva.cantidad, CANTIDAD_MAXIMA) } : l,
  );
}

export function cambiarCantidad(lineas: LineaCarrito[], clave: string, delta: number): LineaCarrito[] {
  return lineas
    .map((l) => (l.clave === clave ? { ...l, cantidad: Math.min(l.cantidad + delta, CANTIDAD_MAXIMA) } : l))
    .filter((l) => l.cantidad > 0);
}

export const totalArticulos = (lineas: LineaCarrito[]) => lineas.reduce((s, l) => s + l.cantidad, 0);
export const totalCarrito = (lineas: LineaCarrito[]) => lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
