import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Si el usuario entra con una contraseña temporal, debe cambiarla antes de seguir. */
export async function exigirContrasenaPropia(supabase: SupabaseClient, usuarioId: string) {
  const { data } = await supabase.from("profiles").select("must_change_password").eq("user_id", usuarioId).maybeSingle();
  if (data?.must_change_password) redirect("/panel/contrasena");
}
