"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clienteServidor } from "@/lib/supabase/servidor";
import { esquemaAcceso, rutaInternaSegura, type EstadoFormulario } from "@/lib/validaciones";

export async function iniciarSesion(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const parsed = esquemaAcceso.safeParse({ email: datos.get("email"), password: datos.get("password") });
  if (!parsed.success) return { errores: z.flattenError(parsed.error).fieldErrors };

  const supabase = await clienteServidor();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Mensaje genérico: no revela si el correo existe.
    if (error.status === 429) return { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." };
    return { error: "Correo o contraseña incorrectos." };
  }
  redirect(rutaInternaSegura(datos.get("siguiente")));
}

export async function cerrarSesion() {
  const supabase = await clienteServidor();
  await supabase.auth.signOut();
  redirect("/acceso");
}
