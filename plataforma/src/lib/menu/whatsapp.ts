// Pedidos por WhatsApp con el enlace normal de WhatsApp (wa.me): el cliente
// ve su pedido ya escrito en su propio WhatsApp y él decide enviarlo.
// No se usa la API de WhatsApp ni se envía nada automáticamente.
// Sin Zod: este archivo lo descarga el teléfono del cliente.
import { formatoDinero } from "@/lib/dinero";
import { totalCarrito, type LineaCarrito } from "./carrito";

const CODIGO_GUATEMALA = "502";

/**
 * Número que escribió el dueño → solo dígitos con código de país, o null si no es válido.
 * "5555-1234" → "50255551234"; "+502 5555 1234" → "50255551234"; otros países con su código.
 */
export function numeroWhatsApp(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const digitos = texto.replace(/\D/g, "");
  if (digitos.length === 8) return CODIGO_GUATEMALA + digitos;
  if (digitos.length >= 10 && digitos.length <= 15 && !digitos.startsWith("0")) return digitos;
  return null;
}

export type DatosPedidoWhatsApp = {
  restaurante: string;
  moneda: string;
  lineas: LineaCarrito[];
  /** Mesa desde la que se abrió el menú (QR). */
  mesa?: string;
  nombre?: string;
  /** Sin mesa: para llevar o a domicilio (con dirección). */
  entrega?: { tipo: "llevar" } | { tipo: "domicilio"; direccion: string };
  notas?: string;
};

/** Texto del pedido que el cliente envía al restaurante. */
export function mensajePedido(d: DatosPedidoWhatsApp): string {
  const Q = (c: number) => formatoDinero(c, d.moneda);
  const total = totalCarrito(d.lineas);
  const lineas = d.lineas.map((l) => {
    const detalle = l.detalle.length > 0 ? ` (${l.detalle.join(", ")})` : "";
    const nota = l.nota ? `\n   Nota: ${l.nota}` : "";
    return `• ${l.cantidad} × ${l.nombre}${detalle} — ${Q(l.precioUnitario * l.cantidad)}${nota}`;
  });
  const partes = [
    `Hola, quiero hacer un pedido en ${d.restaurante}:`,
    "",
    ...lineas,
    "",
    `Total: ${Q(total)}`,
  ];
  if (d.mesa) partes.push(d.mesa);
  if (d.entrega?.tipo === "llevar") partes.push("Para llevar");
  if (d.entrega?.tipo === "domicilio") partes.push(`A domicilio: ${d.entrega.direccion.trim()}`);
  if (d.nombre?.trim()) partes.push(`Nombre: ${d.nombre.trim()}`);
  if (d.notas?.trim()) partes.push(`Notas: ${d.notas.trim()}`);
  partes.push("Pago en efectivo.");
  return partes.join("\n");
}

/** Enlace que abre WhatsApp con el mensaje escrito (en el teléfono abre la app). */
export function enlaceWhatsApp(numero: string, mensaje: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
