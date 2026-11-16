import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { VistaMenu } from "@/components/menu/vista-menu";
import type { EstadoMesa } from "@/lib/pedidos";
import { clientePublico } from "@/lib/supabase/publico";
import { obtenerMenuPublico } from "@/server/menu-publico";

export async function generateMetadata({ params }: PageProps<"/r/[slug]/mesa/[codigo]">): Promise<Metadata> {
  const { slug } = await params;
  const menu = await obtenerMenuPublico(slug);
  return { title: { absolute: menu ? `${menu.restaurante.nombre} · Pedir en mesa` : "Menú" }, robots: { index: false } };
}

// El menú sale de la caché; la mesa (y si se puede pedir ahora) se consulta en el momento.
export const instant = false;

export default async function PaginaMesa({ params }: PageProps<"/r/[slug]/mesa/[codigo]">) {
  await connection();
  const { slug, codigo } = await params;
  if (!/^[0-9a-f]{24}$/.test(codigo)) notFound();

  const { data: mesa } = await clientePublico().rpc("table_by_qr", { p_code: codigo })
    .maybeSingle<{ slug: string; label: string; estado: EstadoMesa }>();
  // El código debe ser de ESTE restaurante.
  if (!mesa || mesa.slug !== slug) notFound();

  const menu = await obtenerMenuPublico(slug);
  if (!menu) notFound();
  return <VistaMenu menu={menu} mesa={{ codigo, etiqueta: mesa.label, estado: mesa.estado }} />;
}
