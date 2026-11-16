"use client";

import { createBrowserClient } from "@supabase/ssr";
import { envPublico } from "@/lib/env";

/**
 * Cliente de Supabase en el navegador, con la sesión del usuario (cookies).
 * Solo usa la clave PÚBLICA: todo lo que recibe pasa por las reglas RLS.
 * Se usa para el aviso en tiempo real de pedidos.
 */
export function clienteNavegador() {
  const env = envPublico();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
