import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonAccion } from "@/components/panel/controles";
import { SinPermiso } from "@/components/panel/sin-permiso";
import { SubirFoto } from "@/components/panel/subir-foto";
import { envPublico } from "@/lib/env";
import { urlImagen } from "@/lib/menu/imagenes";
import { contextoPagina } from "@/server/panel/contexto";
import { borrarProducto, quitarFotoProducto, subirFotoProducto } from "../../acciones";
import { EditorOpciones, FormularioProducto } from "../../formularios";

export const metadata: Metadata = { title: "Producto" };

type Producto = {
  id: string; name: string; description: string | null; price_cents: number | null; category_id: string;
  active: boolean; sold_out: boolean; featured: boolean;
  product_images: { storage_path: string; position: number }[];
  option_groups: { id: string; name: string; min_select: number; max_select: number; position: number;
    options: { id: string; name: string; price_delta_cents: number; position: number }[] }[];
};

export default async function PaginaProducto({ params, searchParams }: PageProps<"/panel/[slug]/menu/producto/[id]">) {
  const { slug, id } = await params;
  const { categoria, nuevo } = await searchParams;
  const { ctx, autorizado } = await contextoPagina(slug, "menu.edit");
  if (!autorizado) return <SinPermiso />;

  const { data: categorias } = await ctx.supabase.from("categories").select("id, name")
    .eq("restaurant_id", ctx.restaurante.id).order("position");

  if (id === "nuevo") {
    return (
      <div className="flex flex-col gap-6">
        <Link href={`/panel/${slug}/menu`} className="text-sm text-tenue">← Volver al menú</Link>
        <h2 className="font-titulo text-2xl">Nuevo producto</h2>
        {!categorias?.length ? (
          <p className="text-sm text-tenue">Primero crea una categoría.</p>
        ) : (
          <FormularioProducto slug={slug} producto={null} categorias={categorias}
            categoriaInicial={typeof categoria === "string" ? categoria : undefined} />
        )}
      </div>
    );
  }

  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: p } = await ctx.supabase.from("products")
    .select("id, name, description, price_cents, category_id, active, sold_out, featured, product_images(storage_path, position), option_groups(id, name, min_select, max_select, position, options(id, name, price_delta_cents, position))")
    .eq("id", id).eq("restaurant_id", ctx.restaurante.id).maybeSingle<Producto>();
  if (!p) notFound();

  const foto = [...p.product_images].sort((a, b) => a.position - b.position).map((f) => urlImagen(f.storage_path, envPublico().NEXT_PUBLIC_SUPABASE_URL)).find(Boolean) ?? null;
  const grupos = [...p.option_groups].sort((a, b) => a.position - b.position)
    .map((g) => ({ ...g, options: [...g.options].sort((a, b) => a.position - b.position) }));

  return (
    <div className="flex flex-col gap-8">
      <Link href={`/panel/${slug}/menu`} className="text-sm text-tenue">← Volver al menú</Link>
      {nuevo && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">Producto creado. Puedes agregarle foto y opciones.</p>}
      <section className="flex flex-col gap-4">
        <h2 className="font-titulo text-2xl">{p.name}</h2>
        <FormularioProducto slug={slug} producto={p} categorias={categorias ?? []} />
      </section>
      <section>
        <SubirFoto etiqueta="Foto del producto" actual={foto}
          subir={subirFotoProducto.bind(null, slug, p.id)} quitar={quitarFotoProducto.bind(null, slug, p.id)} />
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">Opciones para el cliente</h3>
        <p className="text-sm text-tenue">Preguntas que el cliente responde al pedir, por ejemplo qué cerveza quiere o qué extras agrega.</p>
        <EditorOpciones slug={slug} productoId={p.id} grupos={grupos} />
      </section>
      <section className="border-t border-linea pt-6">
        <p className="mb-3 text-sm text-tenue">Si solo quieres que no se vea por un tiempo, desmarca &quot;Visible&quot; en lugar de borrarlo.</p>
        <BotonAccion accion={borrarProducto.bind(null, slug, p.id)} peligro confirmar={`¿Borrar "${p.name}" para siempre?`}>
          Borrar producto
        </BotonAccion>
      </section>
    </div>
  );
}
