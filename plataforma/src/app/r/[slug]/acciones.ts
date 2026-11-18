"use server";

import { z } from "@/lib/zod";
import { articulosParaBase, esquemaPedidoDomicilio, mensajeError, notasDomicilio } from "@/lib/pedidos";
import { clientePublico } from "@/lib/supabase/publico";

export type ResultadoDomicilio = { token: string } | { error: string; errores?: Record<string, string[]> };

/**
 * Pedido a domicilio (sin cuenta). Igual que en mesa: solo se manda QUÉ y
 * CUÁNTO; la base de datos pone precios, envío y revisa horario y pausa.
 */
export async function enviarDomicilio(entrada: unknown): Promise<ResultadoDomicilio> {
  const d = esquemaPedidoDomicilio.safeParse(entrada);
  if (!d.success) {
    return { error: "Revisa los datos marcados.", errores: z.flattenError(d.error).fieldErrors as Record<string, string[]> };
  }

  const { data, error } = await clientePublico()
    .rpc("create_delivery_order", {
      p_slug: d.data.slug,
      p_items: articulosParaBase(d.data.lineas),
      p_customer_name: d.data.nombre,
      p_phone: d.data.telefono,
      p_address: d.data.direccion,
      p_references: d.data.referencias || null,
      p_notes: notasDomicilio(d.data) || null,
      p_idempotency_key: d.data.clave,
    })
    .single<{ order_number: number; tracking_token: string; total_cents: number }>();

  if (error || !data) {
    if (error && !mensajeError(error.message, "")) console.error("[domicilio]", error);
    return { error: mensajeError(error?.message, "No se pudo enviar el pedido. Revisa tu conexión e inténtalo de nuevo.") };
  }
  return { token: data.tracking_token };
}
