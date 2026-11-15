import "server-only";
import { createClient } from "@supabase/supabase-js";
import { envPublico } from "@/lib/env";

/**
 * Cliente ANÓNIMO, sin cookies ni sesión: ve exactamente lo mismo que
 * cualquier visitante (RLS del rol anon). Se usa para el menú público,
 * que se puede guardar en caché porque es igual para todos.
 */
export function clientePublico() {
  const env = envPublico();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
