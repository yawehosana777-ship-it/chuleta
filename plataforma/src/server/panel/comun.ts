import "server-only";
import { updateTag } from "next/cache";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/validaciones";
import { etiquetaMenu } from "@/server/menu-publico";
import { NoAutorizado } from "./contexto";

export const NO_AUTORIZADO = "No autorizado: tu usuario no tiene permiso para hacer esto.";

/** Ejecuta una acción del panel y convierte cualquier fallo en un mensaje claro. */
export async function intentar(fn: () => Promise<EstadoFormulario | void>): Promise<EstadoFormulario> {
  try {
    return (await fn()) ?? { exito: "Guardado." };
  } catch (e) {
    if (e instanceof NoAutorizado) return { error: NO_AUTORIZADO };
    if (e instanceof z.ZodError) return { errores: z.flattenError(e).fieldErrors as Record<string, string[]>, error: "Revisa los datos marcados." };
    // redirect()/notFound() de Next.js deben seguir su camino.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error("[panel]", e);
    return { error: "No se pudo guardar. Inténtalo de nuevo." };
  }
}

type ErrorSupabase = { code?: string; message?: string } | null;

/** Traduce los errores de la base de datos. Lanza NoAutorizado si fue por permisos. */
export function revisar(error: ErrorSupabase, mensajes: Record<string, string> = {}): EstadoFormulario | null {
  if (!error) return null;
  const clave = Object.keys(mensajes).find((k) => error.message?.includes(k) || error.code === k);
  if (clave) return { error: mensajes[clave] };
  if (error.code === "42501" || error.message?.includes("row-level security") || error.message?.includes("not_authorized")) {
    throw new NoAutorizado();
  }
  if (error.code === "23503") return { error: "No se puede: hay otros datos que dependen de esto." };
  if (error.code === "23514") return { error: "Algún dato no es válido." };
  console.error("[panel] supabase", error);
  return { error: "No se pudo guardar. Inténtalo de nuevo." };
}

/** El menú público se actualiza al instante (sin esperar el minuto de caché). */
export function refrescarMenu(slug: string) {
  updateTag(etiquetaMenu(slug));
}

export const leer = (datos: FormData, ...campos: string[]) =>
  Object.fromEntries(campos.map((c) => [c, datos.get(c) ?? undefined]));
