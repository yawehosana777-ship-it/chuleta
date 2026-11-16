// Carga la carta de Don Chuleta en un restaurante existente.
// Uso: npm run carta:cargar -- --slug don-chuleta [--reemplazar]
import { parseArgs } from "node:util";
import { cartaDonChuleta } from "../supabase/seed/don-chuleta";
import { clienteAdmin, fallar } from "./_comun";

const { values } = parseArgs({
  options: { slug: { type: "string" }, reemplazar: { type: "boolean", default: false } },
});
if (!values.slug) fallar("Indica el restaurante: --slug don-chuleta");

const db = clienteAdmin();

const { data: restaurante, error: e1 } = await db.from("restaurants").select("id, name").eq("slug", values.slug).maybeSingle();
if (e1) fallar(e1.message);
if (!restaurante) fallar(`No existe el restaurante "${values.slug}". Créalo primero con npm run restaurante:crear.`);
const rid = restaurante.id as string;

const { count } = await db.from("categories").select("id", { count: "exact", head: true }).eq("restaurant_id", rid);
if (count && !values.reemplazar) {
  fallar(`"${restaurante.name}" ya tiene ${count} categorías. Usa --reemplazar para borrar el menú actual y cargarlo de nuevo.`);
}
if (count) {
  const { error } = await db.from("products").delete().eq("restaurant_id", rid);
  if (error) fallar(`No se pudo borrar el menú anterior: ${error.message}`);
  const { error: e2 } = await db.from("categories").delete().eq("restaurant_id", rid);
  if (e2) fallar(`No se pudo borrar el menú anterior: ${e2.message}`);
}

let productos = 0;
for (const [i, cat] of cartaDonChuleta.entries()) {
  const { data: categoria, error } = await db
    .from("categories")
    .insert({ restaurant_id: rid, name: cat.nombre, description: cat.descripcion ?? null, position: i })
    .select("id")
    .single();
  if (error) fallar(`Categoría "${cat.nombre}": ${error.message}`);

  for (const [j, p] of cat.productos.entries()) {
    const { data: producto, error: ep } = await db
      .from("products")
      .insert({
        restaurant_id: rid,
        category_id: categoria.id,
        name: p.nombre,
        price_cents: p.precio === null ? null : Math.round(p.precio * 100),
        position: j,
      })
      .select("id")
      .single();
    if (ep) fallar(`Producto "${p.nombre}": ${ep.message}`);
    productos++;

    if (p.opciones) {
      const { data: grupo, error: eg } = await db
        .from("option_groups")
        .insert({ restaurant_id: rid, product_id: producto.id, name: p.opciones.grupo, min_select: 1, max_select: 1 })
        .select("id")
        .single();
      if (eg) fallar(`Opciones de "${p.nombre}": ${eg.message}`);
      const { error: eo } = await db.from("options").insert(
        p.opciones.elecciones.map((nombre, k) => ({ restaurant_id: rid, group_id: grupo.id, name: nombre, position: k })),
      );
      if (eo) fallar(`Opciones de "${p.nombre}": ${eo.message}`);
    }
  }
}

console.log(`\n✓ Carta cargada en "${restaurante.name}": ${cartaDonChuleta.length} categorías, ${productos} productos.\n`);
