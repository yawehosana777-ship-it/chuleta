"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { correoEmpleado } from "@/lib/permisos";
import { clienteServidor } from "@/lib/supabase/servidor";
import type { EstadoFormulario } from "@/lib/validaciones";
import { esquemaAccesoEmpleado } from "@/lib/validaciones-panel";

export async function iniciarSesionEmpleado(_p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const parsed = esquemaAccesoEmpleado.safeParse({
    restaurante: datos.get("restaurante"), usuario: datos.get("usuario"), contrasena: datos.get("contrasena"),
  });
  if (!parsed.success) return { errores: z.flattenError(parsed.error).fieldErrors };
  const d = parsed.data;

  const supabase = await clienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: correoEmpleado(d.usuario, d.restaurante), password: d.contrasena });
  if (error) {
    if (error.status === 429) return { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." };
    // Mensaje genérico: no revela si el usuario existe.
    return { error: "Usuario o contraseña incorrectos." };
  }
  redirect(`/panel/${d.restaurante}`);
}
