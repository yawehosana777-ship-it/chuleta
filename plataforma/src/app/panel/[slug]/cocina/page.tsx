import type { Metadata } from "next";
import Link from "next/link";
import { Actualizar } from "@/components/actualizar";
import { BotonAccion } from "@/components/panel/controles";
import { Demora } from "@/components/panel/demora";
import { SinPermiso } from "@/components/panel/sin-permiso";
import { contextoPagina, type ContextoPanel } from "@/server/panel/contexto";
import { cambiarEstado } from "../pedidos/acciones";

export const metadata: Metadata = { title: "Cocina" };

// Página privada: espera a confirmar sesión y permisos.
export const instant = false;

type Pedido = {
  id: string; number: number; type: "dine_in" | "delivery"; status: "aceptado" | "en_preparacion"; version: number;
  created_at: string; notes: string | null; customer_name: string | null;
  table_accounts: { tables: { label: string } | null } | null;
  order_items: { product_id: string | null; product_name: string; quantity: number; options: { name: string }[]; notes: string | null }[];
};

/**
 * Pantalla para cocina o barra (tablet o teléfono): solo lo que hay que
 * preparar, con letra grande. Con un área elegida, cada pedido muestra solo
 * lo de esa área.
 */
export default async function PaginaCocina({ params, searchParams }: PageProps<"/panel/[slug]/cocina">) {
  const { slug } = await params;
  const { area } = await searchParams;
  const { ctx, autorizado } = await contextoPagina(slug, "orders.view");
  if (!autorizado) return <SinPermiso />;

  const { ahora, pedidos, areas, areaDeProducto, limite } = await leerDatos(ctx);
  const elegida = areas.find((a) => a.id === area) ?? null;
  const delArea = (i: Pedido["order_items"][number]) => !elegida || !i.product_id || areaDeProducto.get(i.product_id) === elegida.id;
  const visibles = pedidos
    .map((p) => ({ ...p, propios: p.order_items.filter(delArea), otros: p.order_items.some((i) => !delArea(i)) }))
    .filter((p) => p.propios.length > 0);
  const puede = ctx.puede("orders.update");

  const columna = (estado: Pedido["status"], titulo: string) => {
    const lista = visibles.filter((p) => p.status === estado);
    return (
      <section className="flex flex-col gap-3" aria-labelledby={`c-${estado}`}>
        <h2 id={`c-${estado}`} className="text-lg font-bold">{titulo} <span className="text-tenue">({lista.length})</span></h2>
        {lista.length === 0 && <p className="rounded-2xl border border-dashed border-linea px-4 py-6 text-center text-tenue">Nada por aquí.</p>}
        {lista.map((p) => (
          <article key={p.id} className={`rounded-2xl border p-4 ${estado === "en_preparacion" ? "border-dorado/50 bg-dorado/5" : "border-linea bg-superficie"}`}>
            <header className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-2xl font-black">#{p.number} <span className="text-lg font-semibold text-tenue">· {p.type === "delivery" ? "Domicilio" : p.table_accounts?.tables?.label ?? "Mesa"}</span></p>
              <Demora creado={p.created_at} ahoraServidor={ahora} limite={limite} grande />
            </header>
            <ul className="mt-3 flex flex-col gap-2">
              {p.propios.map((i, n) => (
                <li key={n} className="text-xl leading-snug">
                  <b>{i.quantity} ×</b> {i.product_name}
                  {i.options.length > 0 && <span className="text-base text-tenue"> ({i.options.map((o) => o.name).join(", ")})</span>}
                  {i.notes && <span className="block pl-7 text-base font-semibold italic text-dorado">“{i.notes}”</span>}
                </li>
              ))}
            </ul>
            {p.notes && <p className="mt-2 rounded-lg bg-superficie-2 px-3 py-2 text-sm">Notas: {p.notes}</p>}
            {p.otros && <p className="mt-2 text-xs text-tenue">Este pedido también lleva cosas de otra área. «Listo» marca el pedido completo.</p>}
            {puede && (
              <div className="mt-3 flex gap-2">
                {estado === "aceptado" && (
                  <BotonAccion accion={cambiarEstado.bind(null, slug, p.id, "en_preparacion", p.version)} className="min-h-12 flex-1 text-base">Empezar</BotonAccion>
                )}
                <BotonAccion accion={cambiarEstado.bind(null, slug, p.id, "listo", p.version)}
                  className="min-h-12 flex-1 border-emerald-400/50 bg-emerald-500/15 text-base">Listo</BotonAccion>
              </div>
            )}
          </article>
        ))}
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Respaldo por si se corta la conexión en vivo. */}
      <Actualizar segundos={30} />
      {areas.length > 0 ? (
        <nav aria-label="Área" className="flex flex-wrap gap-2">
          {[{ id: "", name: "Todas" }, ...areas].map((a) => {
            const activa = (elegida?.id ?? "") === a.id;
            return (
              <Link key={a.id || "todas"} href={a.id ? `/panel/${slug}/cocina?area=${a.id}` : `/panel/${slug}/cocina`}
                aria-current={activa ? "page" : undefined}
                className={`rounded-full px-4 py-2 font-semibold ${activa ? "bg-guinda text-crema" : "border border-linea text-tenue"}`}>
                {a.name}
              </Link>
            );
          })}
        </nav>
      ) : (
        <p className="text-sm text-tenue">
          Consejo: crea áreas (por ejemplo Cocina y Barra) en <Link className="underline" href={`/panel/${slug}/restaurante`}>Restaurante</Link> para
          que cada pantalla muestre solo lo suyo.
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        {columna("aceptado", "Por preparar")}
        {columna("en_preparacion", "Preparando")}
      </div>
    </div>
  );
}

async function leerDatos(ctx: NonNullable<ContextoPanel>) {
  const ahora = Date.now();
  const [{ data: pedidos }, { data: areas }, { data: categorias }, { data: productos }, { data: r }] = await Promise.all([
    ctx.supabase.from("orders")
      .select("id, number, type, status, version, created_at, notes, customer_name, table_accounts(tables(label)), order_items(product_id, product_name, quantity, options, notes)")
      .eq("restaurant_id", ctx.restaurante.id).in("status", ["aceptado", "en_preparacion"])
      .order("created_at", { ascending: true }).limit(100).returns<Pedido[]>(),
    ctx.supabase.from("areas").select("id, name").eq("restaurant_id", ctx.restaurante.id).order("name"),
    ctx.supabase.from("categories").select("id, area_id").eq("restaurant_id", ctx.restaurante.id),
    ctx.supabase.from("products").select("id, category_id").eq("restaurant_id", ctx.restaurante.id),
    ctx.supabase.from("restaurants").select("alert_ready_minutes").eq("id", ctx.restaurante.id).single(),
  ]);
  const areaDeCategoria = new Map((categorias ?? []).map((c) => [c.id, c.area_id as string | null]));
  const areaDeProducto = new Map((productos ?? []).map((p) => [p.id, areaDeCategoria.get(p.category_id) ?? null]));
  return { ahora, pedidos: pedidos ?? [], areas: areas ?? [], areaDeProducto, limite: r?.alert_ready_minutes ?? 25 };
}
