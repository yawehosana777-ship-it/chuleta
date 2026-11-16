import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BotonAccion, Interruptor } from "@/components/panel/controles";
import { SinPermiso } from "@/components/panel/sin-permiso";
import { IconoCategoria } from "@/components/menu/iconos";
import { formatoDinero } from "@/lib/dinero";
import { envPublico } from "@/lib/env";
import { urlImagen } from "@/lib/menu/imagenes";
import { ICONOS, type Icono } from "@/lib/menu/tipos";
import { contextoPagina } from "@/server/panel/contexto";
import { alternar, mover } from "./acciones";
import { FormularioNuevaCategoria } from "./formularios";

export const metadata: Metadata = { title: "Menú" };

type Fila = {
  id: string; name: string; icon: string; active: boolean; position: number;
  products: { id: string; name: string; price_cents: number | null; active: boolean; sold_out: boolean; position: number;
    product_images: { storage_path: string; position: number }[] }[];
};

// Página privada: espera a confirmar sesión y permisos.
export const instant = false;

export default async function PaginaMenuPanel({ params }: PageProps<"/panel/[slug]/menu">) {
  const { slug } = await params;
  const { ctx, autorizado } = await contextoPagina(slug, "menu.edit");
  if (!autorizado) return <SinPermiso />;

  const { data: categorias, error } = await ctx.supabase.from("categories")
    .select("id, name, icon, active, position, products(id, name, price_cents, active, sold_out, position, product_images(storage_path, position))")
    .eq("restaurant_id", ctx.restaurante.id)
    .order("position")
    .returns<Fila[]>();
  const url = envPublico().NEXT_PUBLIC_SUPABASE_URL;
  const icono = (v: string): Icono => ((ICONOS as readonly string[]).includes(v) ? (v as Icono) : "plato");

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-tenue">
        Toca <b className="text-crema">Agotado</b> cuando algo se termine: el menú de los clientes se actualiza al instante.
      </p>
      {error && <p role="alert" className="text-sm text-red-300">No se pudo cargar el menú. Recarga la página.</p>}

      {categorias?.map((c, i) => (
        <section key={c.id} aria-labelledby={`cat-${c.id}`} className="rounded-2xl border border-linea bg-superficie">
          <header className="flex items-center gap-3 border-b border-linea p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-guinda/60 text-dorado-suave">
              <IconoCategoria icono={icono(c.icon)} className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={`cat-${c.id}`} className="truncate font-semibold">{c.name}</h2>
              <p className="text-xs text-tenue">{c.products.length} productos{!c.active && " · Oculta para los clientes"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <BotonAccion accion={mover.bind(null, slug, "categories", c.id, "arriba")} className={i === 0 ? "invisible" : ""}>
                <span aria-label="Subir categoría">↑</span>
              </BotonAccion>
              <BotonAccion accion={mover.bind(null, slug, "categories", c.id, "abajo")} className={i === categorias.length - 1 ? "invisible" : ""}>
                <span aria-label="Bajar categoría">↓</span>
              </BotonAccion>
              <Link href={`/panel/${slug}/menu/categoria/${c.id}`} className="flex min-h-10 items-center rounded-xl border border-linea bg-superficie-2 px-3 text-sm font-semibold">
                Editar
              </Link>
            </div>
          </header>

          <ul className="divide-y divide-linea">
            {[...c.products].sort((a, b) => a.position - b.position).map((p, j, lista) => {
              const foto = [...p.product_images].sort((a, b) => a.position - b.position).map((f) => urlImagen(f.storage_path, url)).find(Boolean);
              return (
                <li key={p.id} className={`flex flex-wrap items-center gap-3 p-3 ${p.active ? "" : "opacity-60"}`}>
                  <Link href={`/panel/${slug}/menu/producto/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-guinda/50 text-dorado-suave">
                      {foto ? <Image src={foto} alt="" fill sizes="48px" className="object-cover" /> : <IconoCategoria icono={icono(c.icon)} className="size-6" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      <span className="block text-xs text-tenue">
                        {p.price_cents === null ? "Precio por confirmar" : formatoDinero(p.price_cents)}
                        {!p.active && " · Oculto"}
                      </span>
                    </span>
                  </Link>
                  <div className="flex items-center gap-1">
                    <Interruptor etiqueta="Agotado" activo={p.sold_out} colorActivo="bg-red-500/80" accion={alternar.bind(null, slug, p.id, "sold_out")} />
                    <Interruptor etiqueta="Visible" activo={p.active} accion={alternar.bind(null, slug, p.id, "active")} />
                    <BotonAccion accion={mover.bind(null, slug, "products", p.id, "arriba")} className={j === 0 ? "invisible" : ""}>
                      <span aria-label={`Subir ${p.name}`}>↑</span>
                    </BotonAccion>
                    <BotonAccion accion={mover.bind(null, slug, "products", p.id, "abajo")} className={j === lista.length - 1 ? "invisible" : ""}>
                      <span aria-label={`Bajar ${p.name}`}>↓</span>
                    </BotonAccion>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="p-3">
            <Link href={`/panel/${slug}/menu/producto/nuevo?categoria=${c.id}`}
              className="flex min-h-11 items-center justify-center rounded-xl border border-dashed border-dorado/40 text-sm font-semibold text-dorado">
              + Agregar producto a {c.name}
            </Link>
          </div>
        </section>
      ))}

      <section className="rounded-2xl border border-linea bg-superficie p-4">
        <h2 className="mb-3 font-semibold">Nueva categoría</h2>
        <FormularioNuevaCategoria slug={slug} />
      </section>
    </div>
  );
}
