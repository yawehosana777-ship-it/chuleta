"use server";

import { redirect } from "next/navigation";
import type { EstadoFormulario } from "@/lib/validaciones";
import {
  esquemaCategoria, esquemaGrupo, esquemaOpcion, esquemaProducto, uuid,
} from "@/lib/validaciones-panel";
import { intentar, leer, refrescarMenu, revisar } from "@/server/panel/comun";
import { contextoAccion } from "@/server/panel/contexto";
import { borrarFoto, subirFoto } from "@/server/panel/fotos";

// Todas las acciones: (1) permiso menu.edit desde la sesión, (2) datos validados,
// (3) cada consulta filtra por el restaurante de la sesión, (4) RLS lo vuelve a exigir.

const NO_ENCONTRADO = { error: "No se encontró. Recarga la página." };

async function siguientePosicion(ctx: Awaited<ReturnType<typeof contextoAccion>>, tabla: "categories" | "products", filtro?: [string, string]) {
  let q = ctx.supabase.from(tabla).select("position").eq("restaurant_id", ctx.restaurante.id).order("position", { ascending: false }).limit(1);
  if (filtro) q = q.eq(filtro[0], filtro[1]);
  const { data } = await q;
  return (data?.[0]?.position ?? -1) + 1;
}

// ---------- Categorías ----------
export async function crearCategoria(slug: string, _p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    const d = esquemaCategoria.parse({ ...leer(datos, "nombre", "descripcion", "icono"), activa: "on" });
    const { error } = await ctx.supabase.from("categories").insert({
      restaurant_id: ctx.restaurante.id, name: d.nombre, description: d.descripcion, icon: d.icono,
      position: await siguientePosicion(ctx, "categories"),
    });
    const fallo = revisar(error);
    if (fallo) return fallo;
    refrescarMenu(slug);
    return { exito: `Categoría "${d.nombre}" creada.` };
  });
}

export async function guardarCategoria(slug: string, id: string, _p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    const d = esquemaCategoria.parse(leer(datos, "nombre", "descripcion", "icono", "activa"));
    const { data, error } = await ctx.supabase.from("categories")
      .update({ name: d.nombre, description: d.descripcion, icon: d.icono, active: d.activa })
      .eq("id", uuid.parse(id)).eq("restaurant_id", ctx.restaurante.id).select("id");
    const fallo = revisar(error);
    if (fallo) return fallo;
    if (!data?.length) return NO_ENCONTRADO;
    refrescarMenu(slug);
    return { exito: "Categoría guardada." };
  });
}

export async function borrarCategoria(slug: string, id: string): Promise<EstadoFormulario> {
  const r = await intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    const { count } = await ctx.supabase.from("products").select("id", { count: "exact", head: true })
      .eq("category_id", uuid.parse(id)).eq("restaurant_id", ctx.restaurante.id);
    if (count) return { error: "Esta categoría tiene productos. Muévelos o bórralos primero, o solo ocúltala." };
    const { data: cat } = await ctx.supabase.from("categories").select("image_path").eq("id", id).eq("restaurant_id", ctx.restaurante.id).maybeSingle();
    const { error } = await ctx.supabase.from("categories").delete().eq("id", id).eq("restaurant_id", ctx.restaurante.id);
    const fallo = revisar(error);
    if (fallo) return fallo;
    await borrarFoto(ctx, cat?.image_path);
    refrescarMenu(slug);
  });
  if (r.error) return r;
  redirect(`/panel/${slug}/menu`);
}

/** Sube o baja una categoría o un producto un lugar (intercambia posiciones). */
export async function mover(slug: string, tabla: "categories" | "products", id: string, direccion: "arriba" | "abajo"): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    if (tabla !== "categories" && tabla !== "products") return NO_ENCONTRADO;
    const { data: actual } = await ctx.supabase.from(tabla).select(tabla === "products" ? "id, position, category_id" : "id, position")
      .eq("id", uuid.parse(id)).eq("restaurant_id", ctx.restaurante.id).maybeSingle<{ id: string; position: number; category_id?: string }>();
    if (!actual) return NO_ENCONTRADO;
    let q = ctx.supabase.from(tabla).select("id, position").eq("restaurant_id", ctx.restaurante.id);
    if (tabla === "products") q = q.eq("category_id", actual.category_id!);
    q = direccion === "arriba"
      ? q.lt("position", actual.position).order("position", { ascending: false })
      : q.gt("position", actual.position).order("position", { ascending: true });
    const { data: vecinos } = await q.limit(1);
    const vecino = vecinos?.[0];
    if (!vecino) return {};
    const [a, b] = await Promise.all([
      ctx.supabase.from(tabla).update({ position: vecino.position }).eq("id", actual.id).eq("restaurant_id", ctx.restaurante.id),
      ctx.supabase.from(tabla).update({ position: actual.position }).eq("id", vecino.id).eq("restaurant_id", ctx.restaurante.id),
    ]);
    const fallo = revisar(a.error ?? b.error);
    if (fallo) return fallo;
    refrescarMenu(slug);
    return {};
  });
}

// ---------- Productos ----------
export async function guardarProducto(slug: string, id: string | null, _p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const r = await intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    const d = esquemaProducto.parse(leer(datos, "nombre", "descripcion", "precio", "categoria", "activo", "agotado", "destacado"));
    const fila = {
      name: d.nombre, description: d.descripcion, price_cents: d.precio, category_id: d.categoria,
      active: d.activo, sold_out: d.agotado, featured: d.destacado,
    };
    if (id) {
      const { data, error } = await ctx.supabase.from("products").update(fila)
        .eq("id", uuid.parse(id)).eq("restaurant_id", ctx.restaurante.id).select("id");
      const fallo = revisar(error, { "23503": "La categoría elegida no existe." });
      if (fallo) return fallo;
      if (!data?.length) return NO_ENCONTRADO;
      refrescarMenu(slug);
      return { exito: "Producto guardado." };
    }
    const { data, error } = await ctx.supabase.from("products")
      .insert({ ...fila, restaurant_id: ctx.restaurante.id, position: await siguientePosicion(ctx, "products", ["category_id", d.categoria]) })
      .select("id").single();
    const fallo = revisar(error, { "23503": "La categoría elegida no existe." });
    if (fallo) return fallo;
    if (!data) return { error: "No se pudo crear el producto." };
    refrescarMenu(slug);
    return { exito: data.id };
  });
  // Producto nuevo: ir a su página para agregar foto y opciones.
  if (!id && r.exito && /^[0-9a-f-]{36}$/.test(r.exito)) redirect(`/panel/${slug}/menu/producto/${r.exito}?nuevo=1`);
  return r;
}

/** Interruptores rápidos desde la lista: agotado / visible. */
export async function alternar(slug: string, id: string, campo: "sold_out" | "active", valor: boolean): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    if (campo !== "sold_out" && campo !== "active") return NO_ENCONTRADO;
    const { data, error } = await ctx.supabase.from("products").update({ [campo]: Boolean(valor) })
      .eq("id", uuid.parse(id)).eq("restaurant_id", ctx.restaurante.id).select("id");
    const fallo = revisar(error);
    if (fallo) return fallo;
    if (!data?.length) return NO_ENCONTRADO;
    refrescarMenu(slug);
    return {};
  });
}

export async function borrarProducto(slug: string, id: string): Promise<EstadoFormulario> {
  const r = await intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    const { data: fotos } = await ctx.supabase.from("product_images").select("storage_path").eq("product_id", uuid.parse(id)).eq("restaurant_id", ctx.restaurante.id);
    const { error } = await ctx.supabase.from("products").delete().eq("id", id).eq("restaurant_id", ctx.restaurante.id);
    const fallo = revisar(error, { "23503": "Este producto ya aparece en pedidos: mejor ocúltalo." });
    if (fallo) return fallo;
    for (const f of fotos ?? []) await borrarFoto(ctx, f.storage_path);
    refrescarMenu(slug);
  });
  if (r.error) return r;
  redirect(`/panel/${slug}/menu`);
}

// ---------- Fotos ----------
export async function subirFotoProducto(slug: string, id: string, datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    const productoId = uuid.parse(id);
    const { data: producto } = await ctx.supabase.from("products").select("id").eq("id", productoId).eq("restaurant_id", ctx.restaurante.id).maybeSingle();
    if (!producto) return NO_ENCONTRADO;
    const subida = await subirFoto(ctx, datos.get("foto"), "productos");
    if ("error" in subida) return { error: subida.error };
    // Una foto por producto: se reemplaza la anterior.
    const { data: anteriores } = await ctx.supabase.from("product_images").select("id, storage_path").eq("product_id", productoId).eq("restaurant_id", ctx.restaurante.id);
    const { error } = await ctx.supabase.from("product_images").insert({ restaurant_id: ctx.restaurante.id, product_id: productoId, storage_path: subida.ruta, position: 0 });
    const fallo = revisar(error);
    if (fallo) { await borrarFoto(ctx, subida.ruta); return fallo; }
    for (const a of anteriores ?? []) {
      await ctx.supabase.from("product_images").delete().eq("id", a.id).eq("restaurant_id", ctx.restaurante.id);
      await borrarFoto(ctx, a.storage_path);
    }
    refrescarMenu(slug);
    return { exito: "Foto actualizada." };
  });
}

export async function quitarFotoProducto(slug: string, id: string): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    const { data: fotos } = await ctx.supabase.from("product_images").select("id, storage_path").eq("product_id", uuid.parse(id)).eq("restaurant_id", ctx.restaurante.id);
    for (const f of fotos ?? []) {
      const { error } = await ctx.supabase.from("product_images").delete().eq("id", f.id).eq("restaurant_id", ctx.restaurante.id);
      const fallo = revisar(error);
      if (fallo) return fallo;
      await borrarFoto(ctx, f.storage_path);
    }
    refrescarMenu(slug);
    return { exito: "Foto quitada." };
  });
}

export async function subirFotoCategoria(slug: string, id: string, datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    const { data: cat } = await ctx.supabase.from("categories").select("image_path").eq("id", uuid.parse(id)).eq("restaurant_id", ctx.restaurante.id).maybeSingle();
    if (!cat) return NO_ENCONTRADO;
    const subida = await subirFoto(ctx, datos.get("foto"), "categorias");
    if ("error" in subida) return { error: subida.error };
    const { error } = await ctx.supabase.from("categories").update({ image_path: subida.ruta }).eq("id", id).eq("restaurant_id", ctx.restaurante.id);
    const fallo = revisar(error);
    if (fallo) { await borrarFoto(ctx, subida.ruta); return fallo; }
    await borrarFoto(ctx, cat.image_path);
    refrescarMenu(slug);
    return { exito: "Foto actualizada." };
  });
}

export async function quitarFotoCategoria(slug: string, id: string): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    const { data: cat } = await ctx.supabase.from("categories").select("image_path").eq("id", uuid.parse(id)).eq("restaurant_id", ctx.restaurante.id).maybeSingle();
    if (!cat) return NO_ENCONTRADO;
    const { error } = await ctx.supabase.from("categories").update({ image_path: null }).eq("id", id).eq("restaurant_id", ctx.restaurante.id);
    const fallo = revisar(error);
    if (fallo) return fallo;
    await borrarFoto(ctx, cat.image_path);
    refrescarMenu(slug);
    return { exito: "Foto quitada." };
  });
}

// ---------- Opciones (ej. "Elige tu cerveza") ----------
export async function guardarGrupo(slug: string, productoId: string, grupoId: string | null, _p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    const d = esquemaGrupo.parse(leer(datos, "nombre", "minimo", "maximo"));
    const fila = { name: d.nombre, min_select: d.minimo, max_select: d.maximo };
    const { data, error } = grupoId
      ? await ctx.supabase.from("option_groups").update(fila).eq("id", uuid.parse(grupoId)).eq("product_id", uuid.parse(productoId)).eq("restaurant_id", ctx.restaurante.id).select("id")
      : await ctx.supabase.from("option_groups").insert({ ...fila, product_id: uuid.parse(productoId), restaurant_id: ctx.restaurante.id }).select("id");
    const fallo = revisar(error, { "23503": "El producto no existe." });
    if (fallo) return fallo;
    if (!data?.length) return NO_ENCONTRADO;
    refrescarMenu(slug);
    return { exito: grupoId ? "Grupo guardado." : "Grupo creado: ahora agrega sus opciones." };
  });
}

export async function borrarGrupo(slug: string, grupoId: string): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    const { error } = await ctx.supabase.from("option_groups").delete().eq("id", uuid.parse(grupoId)).eq("restaurant_id", ctx.restaurante.id);
    const fallo = revisar(error);
    if (fallo) return fallo;
    refrescarMenu(slug);
    return {};
  });
}

export async function guardarOpcion(slug: string, grupoId: string, opcionId: string | null, _p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    const d = esquemaOpcion.parse(leer(datos, "nombre", "extra"));
    const fila = { name: d.nombre, price_delta_cents: d.extra };
    const { data, error } = opcionId
      ? await ctx.supabase.from("options").update(fila).eq("id", uuid.parse(opcionId)).eq("restaurant_id", ctx.restaurante.id).select("id")
      : await ctx.supabase.from("options").insert({ ...fila, group_id: uuid.parse(grupoId), restaurant_id: ctx.restaurante.id }).select("id");
    const fallo = revisar(error, { "23503": "El grupo no existe." });
    if (fallo) return fallo;
    if (!data?.length) return NO_ENCONTRADO;
    refrescarMenu(slug);
    return { exito: opcionId ? "Opción guardada." : "Opción agregada." };
  });
}

export async function borrarOpcion(slug: string, opcionId: string): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "menu.edit");
    const { error } = await ctx.supabase.from("options").delete().eq("id", uuid.parse(opcionId)).eq("restaurant_id", ctx.restaurante.id);
    const fallo = revisar(error);
    if (fallo) return fallo;
    refrescarMenu(slug);
    return {};
  });
}
