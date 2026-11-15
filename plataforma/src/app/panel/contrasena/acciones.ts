"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clienteServidor } from "@/lib/supabase/servidor";
import type { EstadoFormulario } from "@/lib/validaciones";
import { esquemaCambioContrasena } from "@/lib/validaciones-panel";

export async function cambiarMiContrasena(_p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const parsed = esquemaCambioContrasena.safeParse({ contrasena: datos.get("contrasena"), confirmar: datos.get("confirmar") });
  if (!parsed.success) return { errores: z.flattenError(parsed.error).fieldErrors };

  const supabase = await clienteServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/acceso");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.contrasena });
  if (error) {
    if (error.code === "same_password") return { errores: { contrasena: ["Elige una contraseña distinta a la temporal."] } };
    if (error.code === "weak_password") return { errores: { contrasena: ["Elige una contraseña más segura."] } };
    return { error: "No se pudo cambiar la contraseña. Inténtalo de nuevo." };
  }
  await supabase.rpc("mark_password_changed");
  redirect("/panel");
}
