// Genera supabase/seed/don-chuleta.sql a partir de supabase/seed/don-chuleta.ts,
// para cargar la carta desde el SQL Editor de Supabase (sin clave secreta).
// Uso: npm run carta:sql
import { writeFileSync } from "node:fs";
import { cartaDonChuleta } from "../supabase/seed/don-chuleta";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const lineas: string[] = [];

cartaDonChuleta.forEach((cat, i) => {
  lineas.push(
    `  insert into public.categories (restaurant_id, name, description, position)`,
    `    values (rid, ${q(cat.nombre)}, ${cat.descripcion ? q(cat.descripcion) : "null"}, ${i}) returning id into cid;`,
  );
  cat.productos.forEach((p, j) => {
    const precio = p.precio === null ? "null" : String(Math.round(p.precio * 100));
    lineas.push(
      `  insert into public.products (restaurant_id, category_id, name, price_cents, position)`,
      `    values (rid, cid, ${q(p.nombre)}, ${precio}, ${j}) returning id into pid;`,
    );
    if (p.opciones) {
      lineas.push(
        `  insert into public.option_groups (restaurant_id, product_id, name, min_select, max_select)`,
        `    values (rid, pid, ${q(p.opciones.grupo)}, 1, 1) returning id into gid;`,
        `  insert into public.options (restaurant_id, group_id, name, position) values`,
        p.opciones.elecciones.map((e, k) => `    (rid, gid, ${q(e)}, ${k})`).join(",\n") + ";",
      );
    }
  });
});

const sql = `-- Carta de Don Chuleta. GENERADO por scripts/generar-sql-carta.mts; no editar a mano.
-- Pegar en Supabase › SQL Editor y ejecutar DESPUÉS de crear el restaurante.
do $$
declare rid uuid; cid uuid; pid uuid; gid uuid;
begin
  select id into rid from public.restaurants where slug = 'don-chuleta';
  if rid is null then
    raise exception 'Primero crea el restaurante don-chuleta';
  end if;
  if exists (select 1 from public.categories where restaurant_id = rid) then
    raise exception 'Don Chuleta ya tiene carta cargada';
  end if;

${lineas.join("\n")}
end $$;

select c.name as categoria, count(p.id) as productos
from public.categories c
left join public.products p on p.category_id = c.id
join public.restaurants r on r.id = c.restaurant_id and r.slug = 'don-chuleta'
group by c.name, c.position order by c.position;
`;

writeFileSync(new URL("../supabase/seed/don-chuleta.sql", import.meta.url), sql);
console.log("✓ supabase/seed/don-chuleta.sql generado");
