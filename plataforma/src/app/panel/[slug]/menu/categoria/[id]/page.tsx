import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonAccion } from "@/components/panel/controles";
import { SinPermiso } from "@/components/panel/sin-permiso";
import { SubirFoto } from "@/components/panel/subir-foto";
import { envPublico } from "@/lib/env";
import { urlImagen } from "@/lib/menu/imagenes";
import { contextoPagina } from "@/server/panel/contexto";
import { borrarCategoria, quitarFotoCategoria, subirFotoCategoria } from "../../acciones";
import { FormularioCategoria } from "../../formularios";

export const metadata: Metadata = { title: "Editar categoría" };

export default async function PaginaCategoria({ params }: PageProps<"/panel/[slug]/menu/categoria/[id]">) {
  const { slug, id } = await params;
  const { ctx, autorizado } = await contextoPagina(slug, "menu.edit");
  if (!autorizado) return <SinPermiso />;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const { data: c } = await ctx.supabase.from("categories").select("id, name, description, icon, active, image_path")
    .eq("id", id).eq("restaurant_id", ctx.restaurante.id).maybeSingle();
  if (!c) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/panel/${slug}/menu`} className="text-sm text-tenue">← Volver al menú</Link>
      <h2 className="font-titulo text-2xl">{c.name}</h2>
      <FormularioCategoria slug={slug} categoria={c} />
      <SubirFoto etiqueta="Foto de la categoría (se muestra arriba de sus productos)"
        actual={urlImagen(c.image_path, envPublico().NEXT_PUBLIC_SUPABASE_URL)}
        subir={subirFotoCategoria.bind(null, slug, c.id)} quitar={quitarFotoCategoria.bind(null, slug, c.id)} />
      <div className="border-t border-linea pt-6">
        <BotonAccion accion={borrarCategoria.bind(null, slug, c.id)} peligro
          confirmar={`¿Borrar la categoría "${c.name}"? Solo se puede si no tiene productos.`}>
          Borrar categoría
        </BotonAccion>
      </div>
    </div>
  );
}
