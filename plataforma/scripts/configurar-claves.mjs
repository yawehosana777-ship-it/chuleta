// Obtiene las claves del proyecto con la CLI de Supabase (requiere `npx supabase login`)
// y las escribe en .env.local SIN mostrarlas en pantalla.
// Uso: npm run claves:configurar
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const PROYECTO = "uqwojpsvrfoqsfaldkhj";
const ARCHIVO = ".env.local";

let salida;
try {
  salida = execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["supabase", "projects", "api-keys", `--remote=${PROYECTO}`, "--reveal", "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" },
  );
} catch (e) {
  const detalle = String(e.stderr || e.message);
  console.error(
    /login|access token|unauthorized/i.test(detalle)
      ? "\n✗ Primero inicia sesión en la CLI: npx supabase login\n"
      : `\n✗ No se pudieron obtener las claves:\n${detalle.slice(0, 500)}\n`,
  );
  process.exit(1);
}

// Busca los valores por su prefijo, sin depender del formato exacto de la salida.
const valores = [...salida.matchAll(/"(sb_(?:publishable|secret)_[A-Za-z0-9_\-]+|eyJ[A-Za-z0-9_\-.]+)"/g)].map((m) => m[1]);
const publica = valores.find((v) => v.startsWith("sb_publishable_"));
const secreta = valores.find((v) => v.startsWith("sb_secret_"));

if (!publica || !secreta) {
  console.error("\n✗ No encontré la Publishable key y la Secret key en la respuesta de Supabase.\n");
  process.exit(1);
}

let contenido = readFileSync(ARCHIVO, "utf8");
const poner = (nombre, valor) => {
  const linea = `${nombre}=${valor}`;
  const regla = new RegExp(`^${nombre}=.*$`, "m");
  contenido = regla.test(contenido) ? contenido.replace(regla, linea) : `${contenido.trimEnd()}\n${linea}\n`;
};
poner("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publica);
poner("SUPABASE_SECRET_KEY", secreta);
writeFileSync(ARCHIVO, contenido);

const ocultar = (v) => `${v.slice(0, v.indexOf("_", 3) + 5)}…`;
console.log(`\n✓ Claves guardadas en ${ARCHIVO}:\n  Publishable: ${ocultar(publica)}\n  Secret:      ${ocultar(secreta)} (oculta)\n`);
