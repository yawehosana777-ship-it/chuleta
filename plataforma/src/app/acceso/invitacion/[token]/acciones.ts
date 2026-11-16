"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clienteAdmin } from "@/lib/supabase/admin";
import { clienteServidor } from "@/lib/supabase/servidor";
import { hashToken, tokenConFormatoValido } from "@/lib/invitaciones";
import { esquemaAceptarInvitacion, type EstadoFormulario } from "@/lib/validaciones";

const MENSAJES: Record<string, string> = {
  invitation_used: "Esta invitación ya fue utilizada. Inicia sesión con tu correo.",
  invitation_expired: "Esta invitación venció. Pide una nueva.",
  invitation_not_found: "La invitación no existe.",
};

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

  const admin = clienteAdmin();
  const tokenHash = hashToken(token);

  // El correo sale de la invitación guardada, nunca del formulario.
  const { data: vista, error: errorVista } = await admin.rpc("invitation_preview", { p_token_hash: tokenHash }).maybeSingle<{
    email: string; expired: boolean; used: boolean;
  }>();
  if (errorVista) return { error: "No pudimos verificar la invitación. Inténtalo de nuevo." };
  if (!vista) return { error: MENSAJES.invitation_not_found };
  if (vista.used) return { error: MENSAJES.invitation_used };
  if (vista.expired) return { error: MENSAJES.invitation_expired };

  const { data: creado, error: errorUsuario } = await admin.auth.admin.createUser({
    email: vista.email,
    password: parsed.data.password,
    email_confirm: true,
  });
  if (errorUsuario || !creado.user) {
    if (errorUsuario?.code === "email_exists") {
      return { error: "Ese correo ya tiene una cuenta. Por ahora, contacta al administrador de la plataforma." };
    }
    if (errorUsuario?.code === "weak_password") return { errores: { password: ["Elige una contraseña más segura."] } };
    return { error: "No pudimos crear tu cuenta. Inténtalo de nuevo." };
  }

  const { error: errorAceptar } = await admin.rpc("accept_invitation", {
    p_token_hash: tokenHash,
    p_user_id: creado.user.id,
    p_full_name: parsed.data.nombre,
  });
  if (errorAceptar) {
    // Deshace la cuenta para no dejar usuarios huérfanos.
    await admin.auth.admin.deleteUser(creado.user.id);
    const clave = Object.keys(MENSAJES).find((k) => errorAceptar.message.includes(k));
    return { error: clave ? MENSAJES[clave] : "No pudimos completar la invitación. Inténtalo de nuevo." };
  }

  const supabase = await clienteServidor();
  const { error: errorSesion } = await supabase.auth.signInWithPassword({
    email: vista.email,
    password: parsed.data.password,
  });
  if (errorSesion) redirect("/acceso");
  redirect("/panel");
}
