"use server";

import { redirect } from "next/navigation";
import { z } from "@/lib/zod";
import { clienteServidor } from "@/lib/supabase/servidor";
import { tokenConFormatoValido } from "@/lib/invitaciones";
import { esquemaAceptarInvitacion, type EstadoFormulario } from "@/lib/validaciones";

const MENSAJES: Record<string, string> = {
  invitation_used: "Esta invitación ya fue utilizada. Inicia sesión con tu correo.",
  invitation_expired: "Esta invitación venció. Pide una nueva.",
  invitation_not_found: "La invitación no existe.",
  invitation_user_mismatch: "Ese correo ya tiene una cuenta. Contacta al administrador de la plataforma.",
};

type Vista = { email: string; expired: boolean; used: boolean };

export async function aceptarInvitacion(
  token: string,
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  if (!tokenConFormatoValido(token)) return { error: MENSAJES.invitation_not_found };

  const parsed = esquemaAceptarInvitacion.safeParse({
    nombre: datos.get("nombre"),
    password: datos.get("password"),
    confirmar: datos.get("confirmar"),
  });
  if (!parsed.success) return { errores: z.flattenError(parsed.error).fieldErrors };

  const supabase = await clienteServidor();

  // El correo sale de la invitación guardada, nunca del formulario.
  const { data: vista, error: errorVista } = await supabase
    .rpc("invitation_preview_by_token", { p_token: token })
    .maybeSingle<Vista>();
  if (errorVista) return { error: "No pudimos verificar la invitación. Inténtalo de nuevo." };
  if (!vista) return { error: MENSAJES.invitation_not_found };
  if (vista.used) return { error: MENSAJES.invitation_used };
  if (vista.expired) return { error: MENSAJES.invitation_expired };

  const credenciales = { email: vista.email, password: parsed.data.password };
  let { data: alta, error: errorAlta } = await supabase.auth.signUp(credenciales);

  // Reintento: si la cuenta se creó en un intento anterior que no terminó,
  // se entra con la misma contraseña y se completa la invitación.
  if (errorAlta?.code === "user_already_exists") {
    const r = await supabase.auth.signInWithPassword(credenciales);
    if (r.error) return { error: MENSAJES.invitation_user_mismatch };
    alta = { user: r.data.user, session: r.data.session };
    errorAlta = null;
  }
  if (errorAlta || !alta.user) {
    if (errorAlta?.code === "weak_password") return { errores: { password: ["Elige una contraseña más segura."] } };
    if (errorAlta?.status === 429) return { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." };
    return { error: "No pudimos crear tu cuenta. Inténtalo de nuevo." };
  }
  // Supabase devuelve un usuario sin identidades cuando el correo ya existía.
  if (alta.user.identities && alta.user.identities.length === 0) return { error: MENSAJES.invitation_user_mismatch };

  const { error: errorAceptar } = await supabase.rpc("accept_invitation_signup", {
    p_token: token,
    p_user_id: alta.user.id,
    p_full_name: parsed.data.nombre,
  });
  if (errorAceptar) {
    const clave = Object.keys(MENSAJES).find((k) => errorAceptar.message.includes(k));
    return { error: clave ? MENSAJES[clave] : "No pudimos completar la invitación. Inténtalo de nuevo." };
  }

  if (!alta.session) {
    return { exito: "Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión." };
  }
  redirect("/panel");
}
