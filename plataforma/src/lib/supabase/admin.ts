import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "@/lib/zod";
import { envPublico } from "@/lib/env";

/**
 * Cliente con la clave SECRETA: ignora RLS. Solo para operaciones de servidor
 * muy concretas (aceptar invitaciones, scripts). "server-only" hace que
 * Next.js falle al compilar si alguien lo importa desde el navegador.
 */
export function clienteAdmin() {
  const { NEXT_PUBLIC_SUPABASE_URL } = envPublico();
  const secreta = z
    .string({ message: "Falta SUPABASE_SECRET_KEY en .env.local" })
    .min(20, "Falta SUPABASE_SECRET_KEY en .env.local")
    .parse(process.env.SUPABASE_SECRET_KEY);
  return createClient(NEXT_PUBLIC_SUPABASE_URL, secreta, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
