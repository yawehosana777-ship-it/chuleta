import type { Metadata } from "next";
import { SinPermiso } from "@/components/panel/sin-permiso";
import { SubirFoto } from "@/components/panel/subir-foto";
import { envPublico } from "@/lib/env";
import { urlImagen } from "@/lib/menu/imagenes";
import { leerTema, PLANTILLAS } from "@/lib/menu/temas";
import { contextoPagina } from "@/server/panel/contexto";
import { subirImagenRestaurante } from "./acciones";
import { FormularioRestaurante } from "./formulario";
import { SeccionOperacion } from "./operacion";
import { FormularioServicio } from "./servicio";
import { DIAS } from "@/lib/pedidos";

export const metadata: Metadata = { title: "Restaurante" };

type Entrega = { fixed_fee_cents: number | null; min_order_cents: number; area_note: string | null };
type FilaRestaurante = {
  name: string; description: string | null; address: string | null; phone: string | null; whatsapp: string | null;
  theme: unknown; logo_path: string | null; cover_path: string | null; dine_in_enabled: boolean; delivery_enabled: boolean;
  alert_accept_minutes: number; alert_ready_minutes: number;
  delivery_settings: Entrega | Entrega[] | null;
};

/** Centavos → texto del formulario ("15.00"); 0 o vacío → "" (gratis / sin mínimo). */
const monto = (c: number | null | undefined) => (c ? (c / 100).toFixed(2) : "");

// Página privada: espera a confirmar sesión y permisos.
export const instant = false;

export default async function PaginaRestaurante({ params }: PageProps<"/panel/[slug]/restaurante">) {
  const { slug } = await params;
  const { ctx, autorizado } = await contextoPagina(slug, "settings.edit");
  if (!autorizado) return <SinPermiso />;

  const [{ data: r }, { data: horas }, { data: areas }, { data: categorias }] = await Promise.all([
    ctx.supabase.from("restaurants")
      .select("name, description, address, phone, whatsapp, theme, logo_path, cover_path, dine_in_enabled, delivery_enabled, alert_accept_minutes, alert_ready_minutes, delivery_settings(fixed_fee_cents, min_order_cents, area_note)")
      .eq("id", ctx.restaurante.id).single<FilaRestaurante>(),
    ctx.supabase.from("opening_hours").select("weekday, opens_at, closes_at")
      .eq("restaurant_id", ctx.restaurante.id).eq("service", "dine_in").order("opens_at"),
    ctx.supabase.from("areas").select("id, name").eq("restaurant_id", ctx.restaurante.id).order("name"),
    ctx.supabase.from("categories").select("id, name, area_id").eq("restaurant_id", ctx.restaurante.id).order("position"),
  ]);
  if (!r) return null;
  const entrega = Array.isArray(r.delivery_settings) ? r.delivery_settings[0] : r.delivery_settings;
  // Un tramo por día en el formulario ("HH:MM:SS" → "HH:MM").
  const horario = DIAS.map((_, d) => {
    const h = horas?.find((x) => x.weekday === d);
    return h ? { abre: true, desde: h.opens_at.slice(0, 5), hasta: h.closes_at.slice(0, 5) } : { abre: false, desde: "", hasta: "" };
  });
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
      <section className="rounded-2xl border border-linea bg-superficie p-4" aria-labelledby="t-servicio">
        <h2 id="t-servicio" className="mb-4 font-semibold">Pedidos y horario</h2>
        <FormularioServicio slug={slug} mesa={r.dine_in_enabled} horario={horario} domicilio={{
          activo: r.delivery_enabled, zona: entrega?.area_note ?? "", envio: monto(entrega?.fixed_fee_cents), minimo: monto(entrega?.min_order_cents),
        }} />
      </section>
      <section className="rounded-2xl border border-linea bg-superficie p-4" aria-labelledby="t-operacion">
        <h2 id="t-operacion" className="mb-4 font-semibold">Áreas y avisos</h2>
        <SeccionOperacion slug={slug} areas={areas ?? []} categorias={categorias ?? []}
          aceptar={r.alert_accept_minutes} preparar={r.alert_ready_minutes} />
      </section>
    </div>
  );
}
