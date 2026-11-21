// Validación de los formularios del panel. Todo lo que llega del navegador
// se valida aquí ANTES de tocar la base de datos (y la base vuelve a validar).
import { z } from "@/lib/zod";
import { PERMISOS_PERSONAL, USUARIO_VALIDO } from "./permisos";
import { ICONOS } from "./menu/tipos";
import { esquemaContrasena } from "./validaciones";
import { PLANTILLAS, type NombrePlantilla } from "./menu/temas";
import { numeroWhatsApp } from "./menu/whatsapp";

const textoOpcional = (max: number) =>
  z.string().trim().max(max, `Máximo ${max} caracteres.`).transform((v) => (v === "" ? null : v)).nullable().catch(null);
const nombre = (max: number) => z.string().trim().min(1, "Escribe un nombre.").max(max, `Máximo ${max} caracteres.`);
const casilla = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const uuid = z.uuid("Dato inválido.");

/** "35", "35.5", "Q 35.50", "1,250.00" → centavos. Vacío → null (precio por confirmar). */
export function precioACentavos(valor: unknown): number | null | "invalido" {
  if (valor === null || valor === undefined) return null;
  const limpio = String(valor).replace(/q/gi, "").replace(/[\s,]/g, "");
  if (limpio === "") return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(limpio)) return "invalido";
  return Math.round(Number(limpio) * 100);
}

const precio = z.unknown().transform((v, ctx) => {
  const c = precioACentavos(v);
  if (c === "invalido") {
    ctx.addIssue({ code: "custom", message: "Escribe un precio válido, por ejemplo 35 o 35.50." });
    return z.NEVER;
  }
  return c;
});

export const esquemaCategoria = z.object({
  nombre: nombre(80),
  descripcion: textoOpcional(300),
  icono: z.enum(ICONOS).catch("plato"),
  activa: casilla,
});

export const esquemaProducto = z.object({
  nombre: nombre(120),
  descripcion: textoOpcional(600),
  precio,
  categoria: uuid,
  activo: casilla,
  agotado: casilla,
  destacado: casilla,
});

export const esquemaGrupo = z
  .object({
    nombre: nombre(80),
    minimo: z.coerce.number().int().min(0).max(20),
    maximo: z.coerce.number().int().min(1).max(20),
  })
  .refine((g) => g.minimo <= g.maximo, { path: ["maximo"], message: "El máximo debe ser mayor o igual al mínimo." });

export const esquemaOpcion = z.object({
  nombre: nombre(80),
  extra: precio.refine((c) => c !== null, "Escribe 0 si no cuesta más.").transform((c) => c ?? 0),
});

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const esquemaRestaurante = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre.").max(120),
  descripcion: textoOpcional(1000),
  direccion: textoOpcional(300),
  telefono: textoOpcional(30),
  // Con número, el menú muestra "Pedir por WhatsApp". Vacío = sin WhatsApp.
  whatsapp: textoOpcional(30).refine((v) => v === null || numeroWhatsApp(v) !== null, "Escribe un número de WhatsApp válido, por ejemplo 5555-1234."),
  plantilla: z.enum(Object.keys(PLANTILLAS) as [NombrePlantilla, ...NombrePlantilla[]]).catch("parrilla"),
  lema: textoOpcional(80),
  etiquetas: z
    .string()
    .catch("")
    .transform((v) => v.split(",").map((e) => e.trim()).filter(Boolean)),
  acento: hex.optional().or(z.literal("")).catch(""),
  resalte: hex.optional().or(z.literal("")).catch(""),
}).superRefine((d, ctx) => {
  if (d.etiquetas.length > 6) ctx.addIssue({ code: "custom", path: ["etiquetas"], message: "Máximo 6 especialidades." });
  if (d.etiquetas.some((e) => e.length > 24)) ctx.addIssue({ code: "custom", path: ["etiquetas"], message: "Cada especialidad: máximo 24 caracteres." });
});

export const esquemaEmpleado = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre del empleado.").max(120),
  usuario: z.string().trim().toLowerCase().regex(USUARIO_VALIDO, "Usa de 3 a 40 letras minúsculas, números, punto o guion, sin espacios."),
  contrasena: esquemaContrasena,
  rol: z.enum(["staff", "manager"]).catch("staff"),
  permisos: z.array(z.enum(PERMISOS_PERSONAL)).catch([]),
});

export const esquemaPermisos = z.array(z.enum(PERMISOS_PERSONAL)).catch([]);

export const esquemaCambioContrasena = z
  .object({ contrasena: esquemaContrasena, confirmar: z.string() })
  .refine((d) => d.contrasena === d.confirmar, { path: ["confirmar"], message: "Las contraseñas no coinciden." });

export const esquemaAccesoEmpleado = z.object({
  restaurante: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Escribe el código del restaurante."),
  usuario: z.string().trim().toLowerCase().regex(USUARIO_VALIDO, "Escribe tu usuario."),
  contrasena: z.string().min(1, "Escribe tu contraseña.").max(72),
});

// ---------- Fotos ----------
export const TAMANO_MAXIMO_FOTO = 2.5 * 1024 * 1024;
const FIRMAS: { tipo: "image/jpeg" | "image/png" | "image/webp"; ext: string; ok: (b: Uint8Array) => boolean }[] = [
  { tipo: "image/jpeg", ext: "jpg", ok: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { tipo: "image/png", ext: "png", ok: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { tipo: "image/webp", ext: "webp", ok: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" },
];

/** Revisa el contenido real del archivo (no confía en el nombre ni en el tipo que dice el navegador). */
export function tipoDeImagen(bytes: Uint8Array) {
  return FIRMAS.find((f) => bytes.length >= 12 && f.ok(bytes)) ?? null;
}
