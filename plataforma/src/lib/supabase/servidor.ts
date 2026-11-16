import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { envPublico } from "@/lib/env";

/**
 * Cliente de Supabase que actúa COMO el usuario que inició sesión.
 * Todo lo que lee o escribe pasa por las reglas RLS de la base de datos.
 * Crear uno nuevo en cada petición; nunca compartirlo.
 */
export async function clienteServidor() {
  const env = envPublico();
  const almacen = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) almacen.set(name, value, options);
        } catch {
          // Desde un Server Component no se pueden escribir cookies;
          // el proxy (src/proxy.ts) se encarga de renovar la sesión.
        }
      },
    },
  });
}
