"use server";

import { refresh } from "next/cache";
import { mensajeError } from "@/lib/pedidos";
import type { EstadoFormulario } from "@/lib/validaciones";
import { uuid } from "@/lib/validaciones-panel";
import { intentar, revisar } from "@/server/panel/comun";
import { contextoAccion, NoAutorizado } from "@/server/panel/contexto";

export async function crearMesa(slug: string, _p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "tables.manage");
    const nombre = String(datos.get("nombre") ?? "").trim().replace(/\s+/g, " ");
    if (nombre.length < 1 || nombre.length > 40) return { errores: { nombre: ["Escribe un nombre de hasta 40 caracteres, por ejemplo «Mesa 1»."] } };
    const { error } = await ctx.supabase.from("tables").insert({ restaurant_id: ctx.restaurante.id, label: nombre });
    if (error?.code === "23505") return { errores: { nombre: ["Ya existe una mesa con ese nombre."] } };
    const fallo = revisar(error);
    if (fallo) return fallo;
    return { exito: `${nombre} creada. Ya tiene su código QR.` };
  });
}

export async function cambiarMesaActiva(slug: string, mesaId: string, activa: boolean): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "tables.manage");
    const { data, error } = await ctx.supabase.from("tables").update({ active: activa === true })
      .eq("id", uuid.parse(mesaId)).eq("restaurant_id", ctx.restaurante.id).select("id");
    const fallo = revisar(error);
    if (fallo) return fallo;
    if (!data?.length) return { error: "No se encontró la mesa." };
    return { exito: activa ? "Mesa activada." : "Mesa desactivada: su código QR ya no sirve para pedir." };
  });
}

/** Cierra la cuenta de la mesa y registra el cobro en efectivo por el total que vio el empleado. */
export async function cerrarCuenta(slug: string, cuentaId: string, totalVisto: number): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "tables.manage");
    const id = uuid.parse(cuentaId);
    if (!Number.isInteger(totalVisto) || totalVisto < 0) return { error: "Dato inválido." };
    const { data: propia } = await ctx.supabase.from("table_accounts").select("id").eq("id", id).eq("restaurant_id", ctx.restaurante.id).maybeSingle();
    if (!propia) return { error: "No se encontró la cuenta." };

    const { error } = await ctx.supabase.rpc("close_table_account", { p_account: id, p_total_cents: totalVisto });
    if (error) {
      if (error.code === "42501" || error.message?.includes("not_authorized")) throw new NoAutorizado();
      refresh();
      return { error: mensajeError(error.message) };
    }
    return { exito: "Cuenta cerrada y cobro en efectivo registrado." };
  });
}
