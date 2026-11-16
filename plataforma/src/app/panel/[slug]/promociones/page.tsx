import type { Metadata } from "next";
import { BotonAccion } from "@/components/panel/controles";
import { SinPermiso } from "@/components/panel/sin-permiso";
import { formatoDinero } from "@/lib/dinero";
import { contextoPagina, type ContextoPanel } from "@/server/panel/contexto";
import { alternarPromocion, borrarPromocion } from "./acciones";
import { FormularioPromocion, type CategoriaConProductos, type PromocionEditable } from "./formulario";

export const metadata: Metadata = { title: "Promociones" };

// Página privada: espera a confirmar sesión y permisos.
export const instant = false;

type Promo = {
  id: string; name: string; kind: "percent" | "fixed"; value: number; starts_at: string | null; ends_at: string | null;
  stackable: boolean; active: boolean; promotion_items: { product_id: string | null; category_id: string | null }[];
};

export default async function PaginaPromociones({ params }: PageProps<"/panel/[slug]/promociones">) {
  const { slug } = await params;
  const { ctx, autorizado } = await contextoPagina(slug, "menu.edit");
  if (!autorizado) return <SinPermiso />;

  const { ahora, promos, categorias, zona, moneda } = await leerDatos(ctx);
  const Q = (c: number) => formatoDinero(c, moneda);
  // "2026-11-20T18:00" en hora del restaurante, para los campos de fecha.
  const local = (iso: string | null) => {
    if (!iso) return "";
    return new Intl.DateTimeFormat("sv-SE", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .format(new Date(iso)).replace(" ", "T");
  };
  const legible = (iso: string) =>
    new Intl.DateTimeFormat("es-GT", { timeZone: zona, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  const nombreDe = new Map<string, string>([
    ...categorias.map((c) => [c.id, `${c.name} (toda)`] as [string, string]),
    ...categorias.flatMap((c) => c.productos.map((p) => [p.id, p.name] as [string, string])),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl border border-dorado/30 bg-dorado/5 p-4 text-sm text-tenue">
        <p><b className="text-crema">Cómo funcionan:</b> el descuento se muestra en el menú con el precio tachado y lo cobra la base de datos.
          Si un producto tiene varias promociones, se aplica la que más descuenta (solo las «acumulables» se suman).</p>
        <p className="mt-2"><b className="text-crema">Combos:</b> créalos como un producto normal en Menú (por ejemplo «Combo hamburguesa + gaseosa»)
          con su precio y una opción «Elige tu bebida».</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Promociones <span className="text-tenue">({promos.length})</span></h2>
        {promos.length === 0 && <p className="rounded-2xl border border-dashed border-linea px-4 py-6 text-center text-sm text-tenue">Aún no hay promociones.</p>}
        <ul className="flex flex-col gap-3">
          {promos.map((p) => {
            const estado = !p.active ? "Pausada" : p.starts_at && Date.parse(p.starts_at) > ahora ? "Programada"
              : p.ends_at && Date.parse(p.ends_at) <= ahora ? "Vencida" : "Vigente";
            const editable: PromocionEditable = {
              id: p.id, name: p.name, kind: p.kind, valor: p.kind === "percent" ? String(p.value) : (p.value / 100).toFixed(2),
              desde: local(p.starts_at), hasta: local(p.ends_at), stackable: p.stackable, active: p.active,
              productos: p.promotion_items.flatMap((i) => (i.product_id ? [i.product_id] : [])),
              categorias: p.promotion_items.flatMap((i) => (i.category_id ? [i.category_id] : [])),
            };
            const aQue = p.promotion_items.map((i) => nombreDe.get(i.product_id ?? i.category_id ?? "") ?? "—").join(", ");
            return (
              <li key={p.id} className={`rounded-2xl border border-linea bg-superficie p-4 ${estado === "Vigente" ? "" : "opacity-80"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{p.name} <span className="text-dorado">· {p.kind === "percent" ? `-${p.value}%` : `${Q(p.value)} menos`}</span></p>
                    <p className="text-xs text-tenue">
                      <b className={estado === "Vigente" ? "text-emerald-300" : estado === "Programada" ? "text-dorado" : "text-tenue"}>{estado}</b>
                      {p.starts_at && ` · desde ${legible(p.starts_at)}`}{p.ends_at && ` · hasta ${legible(p.ends_at)}`}
                      {p.stackable && " · acumulable"}
                    </p>
                    <p className="mt-1 text-xs text-tenue">Aplica a: {aQue}</p>
                  </div>
                  <div className="flex gap-2">
                    <BotonAccion accion={alternarPromocion.bind(null, slug, p.id, !p.active)}>{p.active ? "Pausar" : "Activar"}</BotonAccion>
                    <BotonAccion accion={borrarPromocion.bind(null, slug, p.id)} peligro confirmar={`¿Borrar la promoción «${p.name}»?`}>Borrar</BotonAccion>
                  </div>
                </div>
                <details className="mt-3 rounded-xl border border-linea p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Editar</summary>
                  <div className="mt-3"><FormularioPromocion slug={slug} promo={editable} categorias={categorias} /></div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl border border-linea bg-superficie p-4">
        <h2 className="mb-4 font-semibold">Nueva promoción</h2>
        <FormularioPromocion slug={slug} categorias={categorias} />
      </section>
    </div>
  );
}

async function leerDatos(ctx: NonNullable<ContextoPanel>) {
  const ahora = Date.now();
  const [{ data: promos }, { data: cats }, { data: r }] = await Promise.all([
    ctx.supabase.from("promotions").select("id, name, kind, value, starts_at, ends_at, stackable, active, promotion_items(product_id, category_id)")
      .eq("restaurant_id", ctx.restaurante.id).in("kind", ["percent", "fixed"]).order("created_at", { ascending: false }).returns<Promo[]>(),
    ctx.supabase.from("categories").select("id, name, position, products(id, name, position)")
      .eq("restaurant_id", ctx.restaurante.id).order("position"),
    ctx.supabase.from("restaurants").select("timezone, currency").eq("id", ctx.restaurante.id).single(),
  ]);
  const categorias: CategoriaConProductos[] = (cats ?? []).map((c) => ({
    id: c.id, name: c.name,
    productos: [...(c.products ?? [])].sort((a, b) => a.position - b.position).map((p) => ({ id: p.id, name: p.name })),
  }));
  return { ahora, promos: promos ?? [], categorias, zona: r?.timezone ?? "America/Guatemala", moneda: r?.currency ?? "GTQ" };
}
