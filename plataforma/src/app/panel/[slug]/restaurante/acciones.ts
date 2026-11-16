"use server";

import { PLANTILLAS } from "@/lib/menu/temas";
import { leerHorario, mensajeError } from "@/lib/pedidos";
import type { EstadoFormulario } from "@/lib/validaciones";
import { esquemaRestaurante } from "@/lib/validaciones-panel";
import { intentar, leer, refrescarMenu, revisar } from "@/server/panel/comun";
import { contextoAccion } from "@/server/panel/contexto";
import { borrarFoto, subirFoto } from "@/server/panel/fotos";

export async function guardarRestaurante(slug: string, _p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "settings.edit");
    const d = esquemaRestaurante.parse(
      leer(datos, "nombre", "descripcion", "direccion", "telefono", "whatsapp", "plantilla", "lema", "etiquetas", "acento", "resalte"),
    );
    // Solo se guarda un color si es distinto al de la plantilla elegida.
    const base = PLANTILLAS[d.plantilla].colores;
    const colores: Record<string, string> = {};
    if (d.acento && d.acento.toLowerCase() !== base.acento) colores.acento = d.acento.toLowerCase();
    if (d.resalte && d.resalte.toLowerCase() !== base.resalte) colores.resalte = d.resalte.toLowerCase();
    const { data, error } = await ctx.supabase.from("restaurants").update({
      name: d.nombre, description: d.descripcion, address: d.direccion, phone: d.telefono, whatsapp: d.whatsapp,
      theme: { plantilla: d.plantilla, lema: d.lema ?? undefined, etiquetas: d.etiquetas, colores },
    }).eq("id", ctx.restaurante.id).select("id");
    const fallo = revisar(error);
    if (fallo) return fallo;
    if (!data?.length) return { error: "No se encontró el restaurante." };
    refrescarMenu(slug);
    return { exito: "Datos guardados. El menú ya muestra los cambios." };
  });
}

/** Pedidos en mesa (sí/no) y horario de atención. Sin horario no se reciben pedidos. */
export async function guardarServicio(slug: string, _p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "settings.edit");
    const { horas, errores } = leerHorario(datos);
    if (Object.keys(errores).length) return { errores, error: "Revisa el horario marcado." };

    const { error: e1 } = await ctx.supabase.rpc("set_opening_hours", { p_restaurant: ctx.restaurante.id, p_service: "dine_in", p_hours: horas });
    if (e1?.message?.includes("invalid_hours")) return { error: mensajeError(e1.message) };
    const f1 = revisar(e1);
    if (f1) return f1;

    const { error: e2 } = await ctx.supabase.from("restaurants")
      .update({ dine_in_enabled: datos.get("mesa") === "on" }).eq("id", ctx.restaurante.id);
    const f2 = revisar(e2);
    if (f2) return f2;
    return { exito: horas.length ? "Horario guardado." : "Guardado. Sin días marcados, no se reciben pedidos desde el teléfono." };
  });
}

export async function subirImagenRestaurante(slug: string, cual: "logo" | "portada", datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "settings.edit");
    const columna = cual === "logo" ? "logo_path" : cual === "portada" ? "cover_path" : null;
    if (!columna) return { error: "Dato inválido." };
    const { data: actual } = await ctx.supabase.from("restaurants").select("logo_path, cover_path").eq("id", ctx.restaurante.id).single();
    const subida = await subirFoto(ctx, datos.get("foto"), "restaurante");
    if ("error" in subida) return { error: subida.error };
    const { error } = await ctx.supabase.from("restaurants").update({ [columna]: subida.ruta }).eq("id", ctx.restaurante.id);
    const fallo = revisar(error);
    if (fallo) { await borrarFoto(ctx, subida.ruta); return fallo; }
    await borrarFoto(ctx, actual?.[columna]);
    refrescarMenu(slug);
    return { exito: cual === "logo" ? "Logo actualizado." : "Portada actualizada." };
  });
}
