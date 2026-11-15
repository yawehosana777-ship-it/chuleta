import type { Metadata } from "next";
import { SinPermiso } from "@/components/panel/sin-permiso";
import { SubirFoto } from "@/components/panel/subir-foto";
import { envPublico } from "@/lib/env";
import { urlImagen } from "@/lib/menu/imagenes";
import { leerTema, PLANTILLAS } from "@/lib/menu/temas";
import { contextoPagina } from "@/server/panel/contexto";
import { subirImagenRestaurante } from "./acciones";
import { FormularioRestaurante } from "./formulario";

export const metadata: Metadata = { title: "Restaurante" };

export default async function PaginaRestaurante({ params }: PageProps<"/panel/[slug]/restaurante">) {
  const { slug } = await params;
  const { ctx, autorizado } = await contextoPagina(slug, "settings.edit");
  if (!autorizado) return <SinPermiso />;

  const { data: r } = await ctx.supabase.from("restaurants")
    .select("name, description, address, phone, whatsapp, theme, logo_path, cover_path").eq("id", ctx.restaurante.id).single();
  if (!r) return null;
  const tema = leerTema(r.theme);
  const base = PLANTILLAS[tema.plantilla].colores;
  const url = envPublico().NEXT_PUBLIC_SUPABASE_URL;

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-6 sm:grid-cols-2">
        <SubirFoto etiqueta="Logo" alto="h-36" actual={urlImagen(r.logo_path, url)} subir={subirImagenRestaurante.bind(null, slug, "logo")} />
        <SubirFoto etiqueta="Foto de portada" alto="h-36" actual={urlImagen(r.cover_path, url)} subir={subirImagenRestaurante.bind(null, slug, "portada")} />
      </section>
      <FormularioRestaurante slug={slug} r={{
        name: r.name, description: r.description, address: r.address, phone: r.phone, whatsapp: r.whatsapp,
        plantilla: tema.plantilla, lema: tema.lema ?? "", etiquetas: tema.etiquetas,
        acento: tema.colores.acento !== base.acento ? tema.colores.acento : "",
        resalte: tema.colores.resalte !== base.resalte ? tema.colores.resalte : "",
      }} />
    </div>
  );
}
