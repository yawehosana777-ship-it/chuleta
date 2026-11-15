import "server-only";
import { randomBytes } from "node:crypto";
import { BUCKET_MENU } from "@/lib/menu/imagenes";
import { TAMANO_MAXIMO_FOTO, tipoDeImagen } from "@/lib/validaciones-panel";
import type { ContextoPanel } from "./contexto";

type Ctx = NonNullable<ContextoPanel>;

/**
 * Sube una foto a la carpeta del restaurante en Storage.
 * La política de Storage vuelve a comprobar carpeta y permiso menu.edit.
 */
export async function subirFoto(ctx: Ctx, archivo: FormDataEntryValue | null, carpeta: "productos" | "categorias" | "restaurante") {
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elige una foto." } as const;
  if (archivo.size > TAMANO_MAXIMO_FOTO) return { error: "La foto es demasiado grande (máximo 2.5 MB)." } as const;
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const tipo = tipoDeImagen(bytes);
  if (!tipo) return { error: "Formato no permitido. Usa una foto JPG, PNG o WebP." } as const;

  const ruta = `${ctx.restaurante.id}/${carpeta}/${randomBytes(9).toString("base64url")}.${tipo.ext}`;
  const { error } = await ctx.supabase.storage.from(BUCKET_MENU).upload(ruta, bytes, { contentType: tipo.tipo, upsert: false });
  if (error) {
    console.error("[panel] subir foto", error);
    return { error: "No se pudo subir la foto. Inténtalo de nuevo." } as const;
  }
  return { ruta } as const;
}

/** Borra una foto de Storage solo si es del propio restaurante (las de /menus/... son de la app). */
export async function borrarFoto(ctx: Ctx, ruta: string | null | undefined) {
  if (!ruta || !ruta.startsWith(`${ctx.restaurante.id}/`)) return;
  const { error } = await ctx.supabase.storage.from(BUCKET_MENU).remove([ruta]);
  if (error) console.error("[panel] borrar foto", error);
}
