"use server";

import { PLANTILLAS } from "@/lib/menu/temas";
import { leerHorario, mensajeError } from "@/lib/pedidos";
import type { EstadoFormulario } from "@/lib/validaciones";
import { esquemaRestaurante, precioACentavos, uuid } from "@/lib/validaciones-panel";
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

/** Pedidos en mesa y a domicilio, y horario de atención. Sin horario no se reciben pedidos. */
export async function guardarServicio(slug: string, _p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "settings.edit");
    const { horas, errores } = leerHorario(datos);
    if (Object.keys(errores).length) return { errores, error: "Revisa el horario marcado." };
    // Domicilio: costo fijo (vacío o 0 = gratis), mínimo opcional y texto de la zona.
    const envio = precioACentavos(datos.get("envio"));
    const minimo = precioACentavos(datos.get("minimo"));
    const zona = String(datos.get("zona") ?? "").trim().replace(/\s+/g, " ");
    if (envio === "invalido") return { errores: { envio: ["Escribe un monto válido o déjalo vacío (gratis)."] } };
    if (minimo === "invalido") return { errores: { minimo: ["Escribe un monto válido o déjalo vacío (sin mínimo)."] } };
    if (zona.length > 120) return { errores: { zona: ["Máximo 120 caracteres."] } };

    const { error: e1 } = await ctx.supabase.rpc("set_opening_hours", { p_restaurant: ctx.restaurante.id, p_service: "dine_in", p_hours: horas });
    if (e1?.message?.includes("invalid_hours")) return { error: mensajeError(e1.message) };
    const f1 = revisar(e1);
    if (f1) return f1;

    const { error: e3 } = await ctx.supabase.from("delivery_settings").upsert({
      restaurant_id: ctx.restaurante.id, method: "fixed", fixed_fee_cents: envio ?? 0, min_order_cents: minimo ?? 0, area_note: zona || null,
    });
    const f3 = revisar(e3);
    if (f3) return f3;

    const { error: e2 } = await ctx.supabase.from("restaurants")
      .update({ dine_in_enabled: datos.get("mesa") === "on", delivery_enabled: datos.get("domicilio") === "on" })
      .eq("id", ctx.restaurante.id);
    const f2 = revisar(e2);
    if (f2) return f2;
    refrescarMenu(slug);
    return { exito: horas.length ? "Guardado." : "Guardado. Sin días marcados en el horario, no se reciben pedidos desde el teléfono." };
  });
}

// ---------- Áreas de preparación y avisos de atraso ----------
export async function crearArea(slug: string, _p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "settings.edit");
    const nombre = String(datos.get("area") ?? "").trim().replace(/\s+/g, " ");
    if (nombre.length < 1 || nombre.length > 60) return { errores: { area: ["Escribe un nombre de hasta 60 caracteres, por ejemplo «Cocina» o «Barra»."] } };
    const { error } = await ctx.supabase.from("areas").insert({ restaurant_id: ctx.restaurante.id, name: nombre });
    if (error?.code === "23505") return { errores: { area: ["Ya existe un área con ese nombre."] } };
    const fallo = revisar(error);
    if (fallo) return fallo;
    return { exito: `Área "${nombre}" creada.` };
  });
}

export async function borrarArea(slug: string, areaId: string): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "settings.edit");
    const { data, error } = await ctx.supabase.from("areas").delete()
      .eq("id", uuid.parse(areaId)).eq("restaurant_id", ctx.restaurante.id).select("id");
    const fallo = revisar(error);
    if (fallo) return fallo;
    if (!data?.length) return { error: "No se encontró el área." };
    return { exito: "Área borrada. Sus categorías quedaron sin área." };
  });
}

/** Área de cada categoría (campo "cat-<id>") y minutos de los avisos de atraso. */
export async function guardarOperacion(slug: string, _p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "settings.edit");
    const aceptar = Number(datos.get("aceptar"));
    const preparar = Number(datos.get("preparar"));
    if (!Number.isInteger(aceptar) || aceptar < 1 || aceptar > 120) return { errores: { aceptar: ["Entre 1 y 120 minutos."] } };
    if (!Number.isInteger(preparar) || preparar < 1 || preparar > 240) return { errores: { preparar: ["Entre 1 y 240 minutos."] } };

    const { error: e1 } = await ctx.supabase.from("restaurants")
      .update({ alert_accept_minutes: aceptar, alert_ready_minutes: preparar }).eq("id", ctx.restaurante.id);
    const f1 = revisar(e1);
    if (f1) return f1;

    // Sin la lista de áreas en el formulario (pantalla Cocina apagada), las áreas no se tocan.
    if (![...datos.keys()].some((k) => k.startsWith("cat-"))) return { exito: "Avisos guardados." };

    // Cada categoría: solo se aceptan ids de categorías y áreas de ESTE restaurante (la base también lo exige).
    const [{ data: categorias }, { data: areas }] = await Promise.all([
      ctx.supabase.from("categories").select("id, area_id").eq("restaurant_id", ctx.restaurante.id),
      ctx.supabase.from("areas").select("id").eq("restaurant_id", ctx.restaurante.id),
    ]);
    const validas = new Set((areas ?? []).map((a) => a.id));
    for (const c of categorias ?? []) {
      const valor = String(datos.get(`cat-${c.id}`) ?? "");
      const nueva = validas.has(valor) ? valor : null;
      if (nueva === c.area_id) continue;
      const { error } = await ctx.supabase.from("categories").update({ area_id: nueva }).eq("id", c.id).eq("restaurant_id", ctx.restaurante.id);
      const fallo = revisar(error);
      if (fallo) return fallo;
    }
    return { exito: "Áreas y avisos guardados." };
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
