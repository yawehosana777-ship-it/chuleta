// Cambia el estado de un restaurante.
// Uso: npm run restaurante:estado -- --slug don-chuleta --estado active|suspended|pending
import { parseArgs } from "node:util";
import { clienteAdmin, fallar } from "./_comun";

const ESTADOS = ["active", "suspended", "pending"] as const;

const { values } = parseArgs({ options: { slug: { type: "string" }, estado: { type: "string" } } });
if (!values.slug) fallar("Indica el restaurante: --slug don-chuleta");
if (!ESTADOS.includes(values.estado as (typeof ESTADOS)[number])) {
  fallar("Indica el estado: --estado active | suspended | pending");
}

const { error } = await clienteAdmin().rpc("set_restaurant_status", { p_slug: values.slug, p_status: values.estado });
if (error) {
  if (error.message.includes("restaurant_not_found")) fallar(`No existe el restaurante "${values.slug}".`);
  fallar(error.message);
}
console.log(`\n✓ "${values.slug}" ahora está en estado: ${values.estado}\n`);
