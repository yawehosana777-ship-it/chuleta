// Pedidos: estados, pasos permitidos y validación de lo que manda el teléfono.
// La base de datos vuelve a validar TODO y calcula los precios; esto solo
// evita viajes inútiles y da mensajes claros.
import { z } from "zod";
import type { Permiso } from "./permisos";

export const ESTADOS = ["nuevo", "aceptado", "en_preparacion", "listo", "entregado", "cancelado"] as const;
export type EstadoPedido = (typeof ESTADOS)[number];

export const NOMBRE_ESTADO: Record<EstadoPedido, string> = {
  nuevo: "Nuevo", aceptado: "Aceptado", en_preparacion: "En preparación", listo: "Listo", entregado: "Entregado", cancelado: "Cancelado",
};

/** Lo que ve el cliente en su teléfono. */
export const ESTADO_CLIENTE: Record<EstadoPedido, string> = {
  nuevo: "Recibido. Esperando que el restaurante lo acepte.",
  aceptado: "Aceptado. Ya está en la lista de la cocina.",
  en_preparacion: "Se está preparando.",
  listo: "¡Listo! Ya te lo llevan a la mesa.",
  entregado: "Entregado. ¡Buen provecho!",
  cancelado: "Cancelado por el restaurante.",
};

export type TipoPedido = "dine_in" | "delivery";

/** Mensaje para el cliente según el tipo de pedido (en domicilio, "listo" = va en camino). */
export function estadoCliente(estado: EstadoPedido, tipo: TipoPedido) {
  if (tipo === "delivery") {
    if (estado === "listo") return "¡Listo! Tu pedido va en camino.";
    if (estado === "entregado") return "Entregado. ¡Buen provecho!";
  }
  return ESTADO_CLIENTE[estado];
}

/** Pasos que se muestran en la línea de avance del cliente. */
export const PASOS_CLIENTE: EstadoPedido[] = ["nuevo", "aceptado", "en_preparacion", "listo", "entregado"];

export const terminado = (e: EstadoPedido) => e === "entregado" || e === "cancelado";

/** Botones que el panel ofrece para avanzar un pedido (cancelar va aparte). */
export function siguientesPasos(estado: EstadoPedido, puede: (p: Permiso) => boolean): { a: EstadoPedido; etiqueta: string }[] {
  if (estado === "nuevo") return puede("orders.accept") ? [{ a: "aceptado", etiqueta: "Aceptar" }] : [];
  if (!puede("orders.update")) return [];
  if (estado === "aceptado") return [{ a: "en_preparacion", etiqueta: "En preparación" }, { a: "listo", etiqueta: "Listo" }];
  if (estado === "en_preparacion") return [{ a: "listo", etiqueta: "Listo" }];
  if (estado === "listo") return [{ a: "entregado", etiqueta: "Entregado" }];
  return [];
}

/**
 * Minutos después de los que un pedido se marca "Atrasado":
 * nuevo sin aceptar → límite para aceptar; aceptado o en preparación → límite para tenerlo listo.
 */
export function limiteAtraso(estado: EstadoPedido, limites: { aceptar: number; preparar: number }) {
  if (estado === "nuevo") return limites.aceptar;
  if (estado === "aceptado" || estado === "en_preparacion") return limites.preparar;
  return null;
}

export const puedeCancelar =(estado: EstadoPedido, puede: (p: Permiso) => boolean) => !terminado(estado) && puede("orders.cancel");

// Estado de la mesa que devuelve table_by_qr.
export type EstadoMesa = "abierto" | "cerrado" | "pausado" | "sin_servicio";
export const MENSAJE_MESA: Record<Exclude<EstadoMesa, "abierto">, string> = {
  cerrado: "En este momento el restaurante está fuera de horario y no recibe pedidos desde el teléfono. Puedes ver el menú y pedirle a tu mesero.",
  pausado: "El restaurante pausó los pedidos por un momento (mucho trabajo en cocina). Puedes pedirle a tu mesero.",
  sin_servicio: "Este restaurante no recibe pedidos desde el teléfono. Puedes ver el menú y pedirle a tu mesero.",
};

const ERRORES: Record<string, string> = {
  table_not_found: "Este código de mesa ya no es válido. Pide ayuda a tu mesero.",
  restaurant_unavailable: "El restaurante no está disponible en este momento.",
  dine_in_disabled: MENSAJE_MESA.sin_servicio,
  orders_paused: MENSAJE_MESA.pausado,
  closed: MENSAJE_MESA.cerrado,
  product_unavailable: "Algún producto se acaba de agotar o cambió. Revisa tu pedido y vuelve a enviarlo.",
  invalid_options: "Revisa las opciones elegidas de tus productos.",
  invalid_items: "Revisa las cantidades de tu pedido.",
  too_many_orders: "Esta mesa ya tiene muchos pedidos. Pide ayuda a tu mesero.",
  invalid_request: "Revisa tu pedido e inténtalo de nuevo.",
  order_changed: "Otra persona acaba de cambiar este pedido. Ya se muestra cómo quedó.",
  invalid_transition: "Ese cambio ya no es posible para este pedido.",
  reason_required: "Escribe el motivo de la cancelación.",
  account_has_pending_orders: "Aún hay pedidos sin entregar en esta mesa. Entrégalos o cancélalos antes de cerrar la cuenta.",
  account_closed: "Esta cuenta ya estaba cerrada.",
  total_changed: "El total cambió (llegó otro pedido). Revisa la cuenta antes de cerrarla.",
  invalid_hours: "Revisa el horario: cada día necesita hora de apertura y de cierre distintas.",
  delivery_disabled: "En este momento el restaurante no está recibiendo pedidos a domicilio desde la página.",
  invalid_phone: "Escribe un teléfono de 8 dígitos, por ejemplo 5555-1234.",
  invalid_customer: "Revisa tu nombre y tu dirección.",
  below_minimum: "Tu pedido no llega al mínimo para domicilio.",
  already_assigned: "Otra persona ya se encargó de este pedido.",
};

/** Traduce el error de la base de datos a un mensaje para la persona. */
export function mensajeError(mensaje: string | undefined, porDefecto = "No se pudo completar. Inténtalo de nuevo.") {
  const clave = Object.keys(ERRORES).find((k) => mensaje?.includes(k));
  return clave ? ERRORES[clave] : porDefecto;
}

// ---------- Lo que manda el teléfono al pedir ----------
export const esquemaPedidoMesa = z.object({
  mesa: z.string().regex(/^[0-9a-f]{24}$/),
  clave: z.string().regex(/^[A-Za-z0-9_-]{16,100}$/),
  nombre: z.string().trim().max(60, "Máximo 60 caracteres.").default(""),
  notas: z.string().trim().max(500, "Máximo 500 caracteres.").default(""),
  lineas: z.array(z.object({
    productoId: z.uuid(),
    cantidad: z.number().int().min(1).max(20),
    opciones: z.array(z.uuid()).max(20),
    nota: z.string().trim().max(200).default(""),
  })).min(1).max(50),
});
export type PedidoMesa = z.input<typeof esquemaPedidoMesa>;

const telefono = z.string().trim().transform((v, ctx) => {
  let d = v.replace(/\D/g, "");
  if (/^502\d{8}$/.test(d)) d = d.slice(3);
  if (!/^\d{8}$/.test(d)) {
    ctx.addIssue({ code: "custom", message: "Escribe un teléfono de 8 dígitos, por ejemplo 5555-1234." });
    return z.NEVER;
  }
  return `${d.slice(0, 4)}-${d.slice(4)}`;
});

export const esquemaPedidoDomicilio = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  clave: z.string().regex(/^[A-Za-z0-9_-]{16,100}$/),
  nombre: z.string().trim().min(2, "Escribe tu nombre.").max(60, "Máximo 60 caracteres."),
  telefono,
  direccion: z.string().trim().min(5, "Escribe tu dirección completa.").max(300, "Máximo 300 caracteres."),
  referencias: z.string().trim().max(300, "Máximo 300 caracteres.").default(""),
  pagaCon: z.string().trim().max(20).default(""),
  notas: z.string().trim().max(400, "Máximo 400 caracteres.").default(""),
  enZona: z.literal(true, "Confirma que tu dirección está dentro de la zona de entrega."),
  lineas: esquemaPedidoMesa.shape.lineas,
});
export type PedidoDomicilio = z.input<typeof esquemaPedidoDomicilio>;

/** "¿Con cuánto pagas?" va dentro de las notas para que quien entrega lleve cambio. */
export function notasDomicilio(d: { pagaCon: string; notas: string }) {
  const monto = d.pagaCon.replace(/[^\d.]/g, "");
  return [monto && `Paga con Q ${monto}`, d.notas].filter(Boolean).join(" · ");
}

/** Lo que espera la función create_table_order (sin precios). */
export const articulosParaBase = (lineas: z.output<typeof esquemaPedidoMesa>["lineas"]) =>
  lineas.map((l) => ({ product_id: l.productoId, quantity: l.cantidad, options: l.opciones, notes: l.nota || null }));

// ---------- Horario ----------
export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;
const hora = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Lee el formulario de horario: abre-0..6, desde-0..6, hasta-0..6. */
export function leerHorario(datos: FormData) {
  const horas: { weekday: number; opens: string; closes: string }[] = [];
  const errores: Record<string, string[]> = {};
  DIAS.forEach((_, d) => {
    if (datos.get(`abre-${d}`) !== "on") return;
    const opens = String(datos.get(`desde-${d}`) ?? "");
    const closes = String(datos.get(`hasta-${d}`) ?? "");
    if (!hora.test(opens) || !hora.test(closes) || opens === closes) {
      errores[`dia-${d}`] = ["Elige la hora de apertura y la de cierre (distintas)."];
      return;
    }
    horas.push({ weekday: d, opens, closes });
  });
  return { horas, errores };
}
