// Utilidades compartidas por los scripts de administración de la plataforma.
// Se ejecutan en tu computadora con la clave secreta de .env.local.
import { createClient } from "@supabase/supabase-js";

export function clienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secreta = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secreta) {
    fallar("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local");
  }
  return createClient(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function fallar(mensaje: string): never {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(1);
}

export function urlSitio() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export const SLUG_VALIDO = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
