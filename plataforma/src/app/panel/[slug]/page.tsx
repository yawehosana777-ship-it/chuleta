import { redirect } from "next/navigation";
import { contextoPagina } from "@/server/panel/contexto";

// Página privada: espera a confirmar sesión y permisos.
export const instant = false;

export default async function InicioRestaurante({ params }: PageProps<"/panel/[slug]">) {
  const { slug } = await params;
  const { ctx } = await contextoPagina(slug);
  if (ctx.puede("orders.view")) redirect(`/panel/${slug}/pedidos`);
  if (ctx.puede("tables.manage")) redirect(`/panel/${slug}/mesas`);
  if (ctx.puede("menu.edit")) redirect(`/panel/${slug}/menu`);
  if (ctx.puede("reports.view")) redirect(`/panel/${slug}/informes`);
  if (ctx.puede("settings.edit")) redirect(`/panel/${slug}/restaurante`);
  if (ctx.puede("staff.manage")) redirect(`/panel/${slug}/empleados`);
  return null;
}
