import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VistaMenu } from "@/components/menu/vista-menu";
import { listarSlugsPublicos, obtenerMenuPublico } from "@/server/menu-publico";

// Los menús de los restaurantes activos se preparan completos por adelantado
// (HTML listo, sin pantalla de carga) y se renuevan solos cada ~1 minuto.
// Un restaurante nuevo se prepara en su primera visita.
export async function generateStaticParams() {
  return (await listarSlugsPublicos()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/r/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const menu = await obtenerMenuPublico(slug);
  if (!menu) return { title: "Menú no encontrado", robots: { index: false } };
  const r = menu.restaurante;
  return {
    title: { absolute: `${r.nombre} · Menú` },
    description: [`Menú digital de ${r.nombre}`, r.descripcion, r.direccion].filter(Boolean).join(" · "),
    openGraph: r.portada ? { images: [r.portada] } : undefined,
  };
}

// Sin <Suspense>: el HTML llega con el menú completo (sin pantalla de carga
// intermedia). Un restaurante que aún no esté preparado espera su primer
// render y desde ahí queda en caché.
export const instant = false;

export default async function PaginaMenu({ params }: PageProps<"/r/[slug]">) {
  const { slug } = await params;
  const menu = await obtenerMenuPublico(slug);
  if (!menu) notFound();
  return <VistaMenu menu={menu} />;
}
