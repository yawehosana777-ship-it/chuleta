// Genera una invitación nueva para un restaurante existente (p. ej. si la anterior venció).
// Uso: npm run restaurante:invitar -- --slug don-chuleta --email dueno@correo.com [--rol owner|manager|staff]
import { parseArgs } from "node:util";
import { DURACION_INVITACION_HORAS, generarToken, hashToken } from "../src/lib/invitaciones";
import { EMAIL_VALIDO, clienteAdmin, fallar, urlSitio } from "./_comun";

const ROLES = ["owner", "manager", "staff"] as const;

const { values } = parseArgs({
  options: { slug: { type: "string" }, email: { type: "string" }, rol: { type: "string", default: "owner" } },
});

const email = values.email?.trim().toLowerCase();
if (!values.slug) fallar("Indica el restaurante: --slug don-chuleta");
if (!email || !EMAIL_VALIDO.test(email)) fallar("Indica el correo: --email persona@correo.com");
if (!ROLES.includes(values.rol as (typeof ROLES)[number])) fallar("El rol debe ser owner, manager o staff.");

const token = generarToken();
const vence = new Date(Date.now() + DURACION_INVITACION_HORAS * 3600_000);

const { error } = await clienteAdmin().rpc("new_invitation", {
  p_slug: values.slug,
  p_email: email,
  p_role: values.rol,
  p_token_hash: hashToken(token),
  p_expires_at: vence.toISOString(),
});
if (error) {
  if (error.message.includes("restaurant_not_found")) fallar(`No existe el restaurante "${values.slug}".`);
  fallar(`No se pudo crear la invitación: ${error.message}`);
}

console.log(`
✓ Invitación creada para ${email} (${values.rol}). Vence el ${vence.toLocaleString("es-GT")}:

  ${urlSitio()}/acceso/invitacion/${token}
`);
