// Convierte una ruta guardada en la base de datos en una URL segura.
//   "/menus/don-chuleta/logo.png"   → archivo incluido en la aplicación
//   "<restaurante>/productos/x.webp" → bucket público "menu" de Supabase Storage (Fase 3)
// Cualquier otra cosa (http://, "..", caracteres raros) se descarta.
const RUTA_SEGURA = /^\/?[A-Za-z0-9][A-Za-z0-9._/-]*\.(png|jpe?g|webp|avif)$/;

export const BUCKET_MENU = "menu";

export function urlImagen(ruta: string | null | undefined, urlSupabase: string): string | null {
  if (!ruta || ruta.length > 300 || !RUTA_SEGURA.test(ruta) || ruta.includes("..")) return null;
  if (ruta.startsWith("/")) return ruta;
  return `${urlSupabase}/storage/v1/object/public/${BUCKET_MENU}/${ruta}`;
}
