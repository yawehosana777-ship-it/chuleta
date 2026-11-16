// Alta de un restaurante nuevo con invitación de un solo uso para su dueño.
// Uso: npm run restaurante:crear -- --nombre "Don Chuleta" --slug don-chuleta --email dueno@correo.com
import { parseArgs } from "node:util";
import { DURACION_INVITACION_HORAS, generarToken, hashToken } from "../src/lib/invitaciones";
import { EMAIL_VALIDO, SLUG_VALIDO, clienteAdmin, fallar, urlSitio } from "./_comun";

const { values } = parseArgs({
  options: { nombre: { type: "string" }, slug: { type: "string" }, email: { type: "string" } },
});

const nombre = values.nombre?.trim();
const slug = values.slug?.trim().toLowerCase();
const email = values.email?.trim().toLowerCase();

if (!nombre || nombre.length < 2) fallar('Indica el nombre: --nombre "Don Chuleta"');
if (!slug || !SLUG_VALIDO.test(slug) || slug.length < 3) {
  fallar("Indica un slug válido (minúsculas, números y guiones): --slug don-chuleta");
}
if (!email || !EMAIL_VALIDO.test(email)) fallar("Indica el correo del dueño: --email dueno@correo.com");

const token = generarToken();
const vence = new Date(Date.now() + DURACION_INVITACION_HORAS * 3600_000);

const { error } = await clienteAdmin().rpc("create_restaurant_with_invitation", {
  p_name: nombre,
  p_slug: slug,
  p_email: email,
  p_token_hash: hashToken(token),
  p_expires_at: vence.toISOString(),
});

if (error) {
  if (error.code === "23505") fallar(`Ya existe un restaurante con el slug "${slug}".`);
  fallar(`No se pudo crear el restaurante: ${error.message}`);
}

console.log(`
✓ Restaurante "${nombre}" creado (estado: pendiente).

  Menú público (cuando esté activo): ${urlSitio()}/r/${slug}

  Envía este enlace SOLO al dueño (${email}). Es de un solo uso y vence el ${vence.toLocaleString("es-GT")}:

  ${urlSitio()}/acceso/invitacion/${token}
`);
