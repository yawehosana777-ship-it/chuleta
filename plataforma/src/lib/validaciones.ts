import { z } from "zod";

export const esquemaAcceso = z.object({
  email: z.email("Escribe un correo válido.").trim().toLowerCase(),
  password: z.string().min(1, "Escribe tu contraseña.").max(72),
});

export const esquemaContrasena = z
  .string()
  .min(10, "La contraseña debe tener al menos 10 caracteres.")
  .max(72, "La contraseña no puede pasar de 72 caracteres.");

export const esquemaAceptarInvitacion = z
  .object({
    nombre: z.string().trim().min(2, "Escribe tu nombre completo.").max(120),
    password: esquemaContrasena,
    confirmar: z.string(),
  })
  .refine((d) => d.password === d.confirmar, {
    path: ["confirmar"],
    message: "Las contraseñas no coinciden.",
  });

/** Solo se permite redirigir a rutas internas (evita redirecciones a otros sitios). */
export function rutaInternaSegura(valor: unknown, porDefecto = "/panel") {
  return typeof valor === "string" && /^\/(?!\/)[\w\-/]*$/.test(valor) ? valor : porDefecto;
}

export type EstadoFormulario = {
  error?: string;
  exito?: string;
  errores?: Record<string, string[] | undefined>;
};
