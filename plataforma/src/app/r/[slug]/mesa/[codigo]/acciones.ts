"use server";

import { articulosParaBase, esquemaPedidoMesa, mensajeError } from "@/lib/pedidos";
import { clientePublico } from "@/lib/supabase/publico";

export type ResultadoPedido = { token: string } | { error: string };

/**
 * El cliente (sin cuenta) envía su pedido de mesa. Solo se manda QUÉ y
 * CUÁNTO: la base de datos busca los precios, revisa horario, pausa y
 * agotados, y suma el pedido a la cuenta abierta de la mesa.
 */
export async function enviarPedido(entrada: unknown): Promise<ResultadoPedido> {
  const d = esquemaPedidoMesa.safeParse(entrada);
  if (!d.success) return { error: "Revisa tu pedido e inténtalo de nuevo." };

  const { data, error } = await clientePublico()
    .rpc("create_table_order", {
      p_qr_code: d.data.mesa,
      p_items: articulosParaBase(d.data.lineas),
      p_customer_name: d.data.nombre || null,
      p_notes: d.data.notas || null,
      p_idempotency_key: d.data.clave,
    })
    .single<{ order_number: number; tracking_token: string; total_cents: number }>();

  if (error || !data) {
    if (error && !mensajeError(error.message, "")) console.error("[pedido]", error);
    return { error: mensajeError(error?.message, "No se pudo enviar el pedido. Revisa tu conexión e inténtalo de nuevo.") };
  }
  return { token: data.tracking_token };
}
