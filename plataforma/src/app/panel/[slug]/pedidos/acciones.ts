"use server";

import { refresh } from "next/cache";
import { ESTADOS, mensajeError, NOMBRE_ESTADO, type EstadoPedido } from "@/lib/pedidos";
import type { Permiso } from "@/lib/permisos";
import type { EstadoFormulario } from "@/lib/validaciones";
import { uuid } from "@/lib/validaciones-panel";
import { intentar, revisar } from "@/server/panel/comun";
import { contextoAccion, NoAutorizado } from "@/server/panel/contexto";

const PERMISO_PARA: Record<EstadoPedido, Permiso> = {
  nuevo: "orders.update", aceptado: "orders.accept", en_preparacion: "orders.update", listo: "orders.update",
  entregado: "orders.update", cancelado: "orders.cancel",
};

async function aplicar(slug: string, pedidoId: string, a: string, version: number, nota: string | null): Promise<EstadoFormulario> {
  if (!(ESTADOS as readonly string[]).includes(a) || !Number.isInteger(version)) return { error: "Dato inválido." };
  const estado = a as EstadoPedido;
  const ctx = await contextoAccion(slug, PERMISO_PARA[estado]);
  const id = uuid.parse(pedidoId);

  // El pedido debe ser de ESTE restaurante (el de la sesión), no de otro.
  const { data: propio } = await ctx.supabase.from("orders").select("id").eq("id", id).eq("restaurant_id", ctx.restaurante.id).maybeSingle();
  if (!propio) return { error: "No se encontró el pedido." };

  const { error } = await ctx.supabase.rpc("set_order_status", { p_order: id, p_to: estado, p_version: version, p_note: nota });
  if (error) {
    if (error.code === "42501" || error.message?.includes("not_authorized")) throw new NoAutorizado();
    // Si otra persona lo cambió, la lista se vuelve a leer para mostrar cómo quedó.
    refresh();
    return { error: mensajeError(error.message) };
  }
  return { exito: `Pedido marcado como ${NOMBRE_ESTADO[estado].toLowerCase()}.` };
}

export async function cambiarEstado(slug: string, pedidoId: string, a: string, version: number): Promise<EstadoFormulario> {
  return intentar(() => aplicar(slug, pedidoId, a, version, null));
}

export async function cancelarPedido(slug: string, pedidoId: string, version: number, _p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const motivo = String(datos.get("motivo") ?? "").trim();
    if (motivo.length < 3) return { errores: { motivo: ["Escribe el motivo (mínimo 3 letras)."] } };
    if (motivo.length > 500) return { errores: { motivo: ["Máximo 500 caracteres."] } };
    return aplicar(slug, pedidoId, "cancelado", version, motivo);
  });
}

/** "Me encargo" (tomar = true) o "Soltar". La base de datos decide quién puede. */
export async function tomarPedido(slug: string, pedidoId: string, tomar: boolean): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "orders.view");
    if (!ctx.puede("orders.accept") && !ctx.puede("orders.update")) throw new NoAutorizado();
    const id = uuid.parse(pedidoId);
    const { data: propio } = await ctx.supabase.from("orders").select("id").eq("id", id).eq("restaurant_id", ctx.restaurante.id).maybeSingle();
    if (!propio) return { error: "No se encontró el pedido." };
    const { error } = await ctx.supabase.rpc("assign_order", { p_order: id, p_tomar: tomar === true });
    if (error) {
      if (error.code === "42501" || error.message?.includes("not_authorized")) throw new NoAutorizado();
      refresh();
      return { error: mensajeError(error.message) };
    }
    return { exito: tomar ? "Ahora te encargas de este pedido." : "Pedido liberado." };
  });
}

/** Pausar o reanudar los pedidos desde el teléfono (por ejemplo, cocina saturada). */
export async function pausarPedidos(slug: string, pausar: boolean): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "settings.edit");
    const { error } = await ctx.supabase.from("restaurants").update({ orders_paused: pausar === true }).eq("id", ctx.restaurante.id);
    const fallo = revisar(error);
    if (fallo) return fallo;
    return { exito: pausar ? "Pedidos en pausa." : "Pedidos reanudados." };
  });
}
