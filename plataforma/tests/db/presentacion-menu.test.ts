// Fase 2: columnas de presentación del menú y SQL de Don Chuleta.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { como, crearBaseDeDatos } from "./base-de-datos";

const SQL = (archivo: string) => readFileSync(join(__dirname, "..", "..", "supabase", archivo), "utf8");
const DUENO = "00000000-0000-0000-0000-0000000000d2";
const OTRO = "00000000-0000-0000-0000-0000000000d3";

let db: PGlite;

beforeAll(async () => {
  db = await crearBaseDeDatos();
  const { rows } = await como<{ token: string }>(db, "postgres", null,
    "select create_restaurant_invite('Don Chuleta', 'don-chuleta', 'dueno@donchuleta.gt') as token");
  await db.exec(`insert into auth.users (id, email) values ('${DUENO}', 'dueno@donchuleta.gt'), ('${OTRO}', 'otro@x.gt')`);
  await como(db, "authenticated", DUENO, "select accept_invitation_signup($1, $2, 'Dueño')", [rows[0].token, DUENO]);
  await db.exec(SQL("seed/don-chuleta.sql"));
});

describe("SQL de presentación de Don Chuleta", () => {
  it("asigna dirección, logo, portada, tema, íconos y fotos", async () => {
    await db.exec(SQL("sql-editor/05-presentacion-don-chuleta.sql"));
    const r = await como<{ address: string; logo_path: string; theme: { plantilla: string; etiquetas: string[] } }>(db, "anon", null,
      "select address, logo_path, theme from restaurants where slug = 'don-chuleta'");
    expect(r.rows[0]).toMatchObject({ address: "Km 248, Malacatancito", logo_path: "/menus/don-chuleta/logo.png" });
    expect(r.rows[0].theme).toMatchObject({ plantilla: "parrilla", etiquetas: ["Carnes", "Hamburguesas", "Cervezas", "Postres"] });

    const c = await como<{ name: string; icon: string; image_path: string | null }>(db, "anon", null,
      "select name, icon, image_path from categories order by position");
    expect(c.rows.map((x) => x.icon)).toEqual(["carne", "hamburguesa", "alitas", "postre", "cerveza", "fria", "caliente", "tequila"]);
    expect(c.rows.filter((x) => x.image_path).map((x) => x.name)).toEqual(["Hamburguesas", "Postres", "Tequila"]);
  });

  it("se puede ejecutar dos veces sin errores", async () => {
    await expect(db.exec(SQL("sql-editor/05-presentacion-don-chuleta.sql"))).resolves.toBeDefined();
  });
});

describe("reglas de las columnas nuevas", () => {
  it("rechaza íconos desconocidos y rutas de imagen peligrosas", async () => {
    for (const sql of [
      "update categories set icon = 'calavera' where name = 'Postres'",
      "update categories set image_path = 'https://malo.com/x.png' where name = 'Postres'",
      "update categories set image_path = '/menus/../secreto.png' where name = 'Postres'",
      "update restaurants set logo_path = 'javascript:alert(1)' where slug = 'don-chuleta'",
      "update restaurants set cover_path = '/x.svg' where slug = 'don-chuleta'",
    ]) {
      await expect(como(db, "postgres", null, sql)).rejects.toThrow(/check constraint/);
    }
  });

  it("el dueño puede cambiar ícono y foto de su categoría; otro usuario no", async () => {
    await como(db, "authenticated", DUENO, "update categories set icon = 'plato' where name = 'Postres'");
    const ajeno = await como(db, "authenticated", OTRO, "update categories set icon = 'carne' where name = 'Postres' returning id");
    expect(ajeno.rows).toHaveLength(0);
    const { rows } = await como<{ icon: string }>(db, "anon", null, "select icon from categories where name = 'Postres'");
    expect(rows[0].icon).toBe("plato");
  });

  it("el público no puede modificar nada del menú", async () => {
    await expect(como(db, "anon", null, "update categories set icon = 'carne'")).rejects.toThrow(/permission denied/);
  });
});
