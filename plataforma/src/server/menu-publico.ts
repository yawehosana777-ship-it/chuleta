import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { envPublico } from "@/lib/env";
import { armarMenu, type FilaCategoria, type FilaRestaurante } from "@/lib/menu/armar";
import type { MenuPublico } from "@/lib/menu/tipos";
import { clientePublico } from "@/lib/supabase/publico";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Etiqueta de caché: el panel (Fase 3) la invalidará al editar el menú. */
export const etiquetaMenu = (slug: string) => `menu:${slug}`;

/**
 * Menú público de un restaurante ACTIVO, o null si no existe / no es visible.
 * Se guarda en caché ~1 minuto: un cambio de precio en la base de datos
 * aparece solo, sin volver a publicar la aplicación.
 */
export async function obtenerMenuPublico(slug: string): Promise<MenuPublico | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(etiquetaMenu(slug));

  if (!SLUG.test(slug) || slug.length > 60) return null;
  const supabase = clientePublico();

  const { data: restaurante, error } = await supabase
    .from("restaurants")
    .select("id, slug, name, description, address, phone, currency, logo_path, cover_path, theme")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el restaurante: ${error.message}`);
  if (!restaurante) return null;

  const { data: categorias, error: errorMenu } = await supabase
    .from("categories")
    .select(
      `id, name, description, icon, image_path, position, active,
       products (id, name, description, price_cents, active, sold_out, featured, position,
         product_images (storage_path, position),
         option_groups (id, name, min_select, max_select, position,
           options (id, name, price_delta_cents, position, active)))`,
    )
    .eq("restaurant_id", restaurante.id)
    .eq("active", true)
    .eq("products.active", true);
  if (errorMenu) throw new Error(`No se pudo leer el menú: ${errorMenu.message}`);

  return armarMenu(
    restaurante as FilaRestaurante,
    (categorias ?? []) as FilaCategoria[],
    envPublico().NEXT_PUBLIC_SUPABASE_URL,
  );
}
