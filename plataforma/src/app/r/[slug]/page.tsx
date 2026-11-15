import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Cargando } from "@/components/ui/cargando";
import { VistaMenu } from "@/components/menu/vista-menu";
import { obtenerMenuPublico } from "@/server/menu-publico";

export async function generateMetadata({ params }: PageProps<"/r/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const menu = await obtenerMenuPublico(slug);
  if (!menu) return { title: "Menú no encontrado", robots: { index: false } };
  const r = menu.restaurante;
  return {
    title: { absolute: `${r.nombre} · Menú` },
    description: [r.descripcion, r.direccion].filter(Boolean).join(" · ") || `Menú digital de ${r.nombre}`,
    openGraph: r.portada ? { images: [r.portada] } : undefined,
  };
}

export default function PaginaMenu({ params }: PageProps<"/r/[slug]">) {
  return (
    <Suspense fallback={<Cargando texto="Cargando el menú…" />}>
      <Menu params={params} />
    </Suspense>
  );
}

async function Menu({ params }: Pick<PageProps<"/r/[slug]">, "params">) {
  const { slug } = await params;
  const menu = await obtenerMenuPublico(slug);
  if (!menu) notFound();
  return <VistaMenu menu={menu} />;
}
