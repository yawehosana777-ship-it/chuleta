"use server";

import { correoEmpleado } from "@/lib/permisos";
import type { EstadoFormulario } from "@/lib/validaciones";
import { esquemaEmpleado, esquemaPermisos, uuid } from "@/lib/validaciones-panel";
import { clientePublico } from "@/lib/supabase/publico";
import { intentar, revisar } from "@/server/panel/comun";
import { contextoAccion } from "@/server/panel/contexto";

/**
 * Alta de empleado SIN clave secreta:
 *  1. Se crea la cuenta con la clave pública en un cliente aparte (no toca la sesión del dueño).
 *  2. La función create_staff_member, con la sesión del dueño, verifica permiso,
 *     que la cuenta sea nueva y que su correo interno sea <usuario>.<restaurante>@...
 */
export async function crearEmpleado(slug: string, _p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "staff.manage");
    const d = esquemaEmpleado.parse({
      nombre: datos.get("nombre"), usuario: datos.get("usuario"), contrasena: datos.get("contrasena"),
      rol: datos.get("rol"), permisos: datos.getAll("permisos"),
    });
    if (d.rol === "manager" && ctx.rol !== "owner") return { error: "Solo el dueño puede crear gerentes." };

    // Evita crear una cuenta huérfana si el usuario ya existe en este restaurante.
    const { data: perfiles } = await ctx.supabase.from("profiles").select("user_id").eq("username", d.usuario);
    if (perfiles?.length) {
      const { count } = await ctx.supabase.from("memberships").select("id", { count: "exact", head: true })
        .eq("restaurant_id", ctx.restaurante.id).in("user_id", perfiles.map((p) => p.user_id));
      if (count) return { errores: { usuario: ["Ese usuario ya existe en tu restaurante."] } };
    }

    const { data: alta, error: errorAlta } = await clientePublico().auth.signUp({
      email: correoEmpleado(d.usuario, slug), password: d.contrasena,
    });
    if (errorAlta || !alta.user || alta.user.identities?.length === 0) {
      if (errorAlta?.code === "weak_password") return { errores: { contrasena: ["Elige una contraseña más segura."] } };
      if (errorAlta?.status === 429) return { error: "Demasiadas cuentas creadas seguidas. Espera unos minutos." };
      if (errorAlta?.code === "user_already_exists" || alta.user?.identities?.length === 0) {
        return { errores: { usuario: ["Ese usuario ya existe. Elige otro."] } };
      }
      console.error("[panel] alta empleado", errorAlta);
      return { error: "No se pudo crear la cuenta del empleado. Inténtalo de nuevo." };
    }

    const { error } = await ctx.supabase.rpc("create_staff_member", {
      p_restaurant: ctx.restaurante.id, p_user_id: alta.user.id, p_username: d.usuario,
      p_full_name: d.nombre, p_role: d.rol, p_permissions: d.rol === "staff" ? d.permisos : [],
    });
    const fallo = revisar(error, {
      username_taken: "Ese usuario ya existe en tu restaurante.",
      invalid_username: "El usuario no es válido.",
      staff_user_mismatch: "No se pudo vincular la cuenta. Inténtalo con otro usuario.",
    });
    if (fallo) return fallo;
    return { exito: `Listo: ${d.nombre} ya puede entrar con el usuario "${d.usuario}" y la contraseña temporal. Al entrar se le pedirá cambiarla.` };
  });
}

export async function cambiarPermisos(slug: string, membresiaId: string, _p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "staff.manage");
    const permisos = esquemaPermisos.parse(datos.getAll("permisos"));
    const id = uuid.parse(membresiaId);
    // La membresía debe ser de ESTE restaurante (además, la función lo vuelve a comprobar).
    const { data: m } = await ctx.supabase.from("memberships").select("id").eq("id", id).eq("restaurant_id", ctx.restaurante.id).maybeSingle();
    if (!m) return { error: "No se encontró el empleado." };
    const { error } = await ctx.supabase.rpc("set_staff_permissions", { p_membership: id, p_permissions: permisos });
    const fallo = revisar(error);
    if (fallo) return fallo;
    return { exito: "Permisos guardados." };
  });
}

export async function cambiarActivo(slug: string, membresiaId: string, activo: boolean): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "staff.manage");
    const id = uuid.parse(membresiaId);
    const { data: m } = await ctx.supabase.from("memberships").select("id").eq("id", id).eq("restaurant_id", ctx.restaurante.id).maybeSingle();
    if (!m) return { error: "No se encontró el empleado." };
    const { error } = await ctx.supabase.rpc("set_staff_active", { p_membership: id, p_active: Boolean(activo) });
    const fallo = revisar(error);
    if (fallo) return fallo;
    return { exito: activo ? "Empleado reactivado." : "Empleado desactivado: ya no puede entrar al panel." };
  });
}

/**
 * Nueva contraseña temporal para un empleado que olvidó la suya.
 * Cambiar la contraseña de OTRA persona solo se puede con la clave secreta
 * (SUPABASE_SECRET_KEY, solo en el servidor). Sin ella, se avisa con claridad.
 */
export async function restablecerContrasena(slug: string, membresiaId: string, _p: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  return intentar(async () => {
    const ctx = await contextoAccion(slug, "staff.manage");
    if (!process.env.SUPABASE_SECRET_KEY) {
      return { error: "Esta función necesita la clave secreta de Supabase en el servidor. Mientras tanto, desactiva al empleado y créale un usuario nuevo." };
    }
    const contrasena = esquemaEmpleado.shape.contrasena.safeParse(datos.get("contrasena"));
    if (!contrasena.success) return { errores: { contrasena: [contrasena.error.issues[0].message] } };
    const id = uuid.parse(membresiaId);
    const { data: m } = await ctx.supabase.from("memberships").select("user_id, role").eq("id", id).eq("restaurant_id", ctx.restaurante.id).maybeSingle();
    if (!m) return { error: "No se encontró el empleado." };
    // Misma regla que para desactivar: nunca al dueño, ni a sí mismo, ni a un gerente si no es el dueño.
    if (m.role === "owner" || m.user_id === ctx.usuarioId || (m.role === "manager" && ctx.rol !== "owner")) {
      return { error: "No autorizado: no puedes cambiar la contraseña de esta persona." };
    }
    const { clienteAdmin } = await import("@/lib/supabase/admin");
    const { error } = await clienteAdmin().auth.admin.updateUserById(m.user_id, { password: contrasena.data });
    if (error) return { error: "No se pudo cambiar la contraseña. Inténtalo de nuevo." };
    return { exito: "Contraseña temporal cambiada. Pídele que entre y elija una nueva." };
  });
}
