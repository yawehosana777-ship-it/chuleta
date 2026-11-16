"use server";

import type { EstadoFormulario } from "@/lib/validaciones";
import { precioACentavos, uuid } from "@/lib/validaciones-panel";
import { intentar, refrescarMenu, revisar } from "@/server/panel/comun";
import { contextoAccion } from "@/server/panel/contexto";

const FECHA = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/;

const ERRORES: Record<string, string> = {
  invalid_promotion: "Revisa el nombre y el valor (porcentaje de 1 a 100, o un monto mayor a 0).",
  invalid_dates: "La fecha de fin debe ser después de la de inicio.",
  promotion_without_items: "Elige al menos un producto o una categoría.",
  "23503": "Algún producto o categoría ya no existe. Recarga la página.",
};

/** Crea (id = null) o edita una promoción. La base de datos valida todo otra vez. */
export async function guardarPromocion(slug: string, id: string | null, _p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    const nombre = String(datos.get("nombre") ?? "").trim();
    const tipo = datos.get("tipo") === "fixed" ? "fixed" : "percent";
    const desde = String(datos.get("desde") ?? "");
    const hasta = String(datos.get("hasta") ?? "");
    const productos = datos.getAll("productos").map(String).filter((v) => uuid.safeParse(v).success);
    const categorias = datos.getAll("categorias").map(String).filter((v) => uuid.safeParse(v).success);

    const errores: Record<string, string[]> = {};
    if (nombre.length < 1 || nombre.length > 120) errores.nombre = ["Escribe un nombre (máximo 120 caracteres)."];
    let valor: number | null = null;
    if (tipo === "percent") {
      valor = Number(datos.get("valor"));
      if (!Number.isInteger(valor) || valor < 1 || valor > 100) errores.valor = ["Escribe un porcentaje entero de 1 a 100."];
    } else {
      const c = precioACentavos(datos.get("valor"));
      if (c === "invalido" || c === null || c < 1) errores.valor = ["Escribe un monto válido, por ejemplo 5 o 7.50."];
      else valor = c;
    }
    if (!FECHA.test(desde) || !FECHA.test(hasta)) errores.desde = ["Fecha inválida."];
    if (!productos.length && !categorias.length) errores.productos = ["Elige al menos un producto o una categoría."];
    if (Object.keys(errores).length) return { errores, error: "Revisa los datos marcados." };

    const { error } = await ctx.supabase.rpc("save_promotion", {
      p_restaurant: ctx.restaurante.id, p_id: id ? uuid.parse(id) : null, p_name: nombre, p_kind: tipo, p_value: valor,
      p_starts: desde, p_ends: hasta, p_stackable: datos.get("acumulable") === "on", p_active: datos.get("activa") === "on",
      p_products: productos, p_categories: categorias,
    });
    const fallo = revisar(error, ERRORES);
    if (fallo) return fallo;
    refrescarMenu(slug);
    return { exito: id ? "Promoción guardada. El menú ya la muestra." : `Promoción "${nombre}" creada.` };
  });
}

export async function alternarPromocion(slug: string, id: string, activa: boolean): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    const { data, error } = await ctx.supabase.from("promotions").update({ active: activa === true })
      .eq("id", uuid.parse(id)).eq("restaurant_id", ctx.restaurante.id).select("id");
    const fallo = revisar(error);
    if (fallo) return fallo;
    if (!data?.length) return { error: "No se encontró la promoción." };
    refrescarMenu(slug);
    return { exito: activa ? "Promoción activada." : "Promoción pausada." };
  });
}

export async function borrarPromocion(slug: string, id: string): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    const { data, error } = await ctx.supabase.from("promotions").delete()
      .eq("id", uuid.parse(id)).eq("restaurant_id", ctx.restaurante.id).select("id");
    const fallo = revisar(error);
    if (fallo) return fallo;
    if (!data?.length) return { error: "No se encontró la promoción." };
    refrescarMenu(slug);
    return { exito: "Promoción borrada." };
  });
}
