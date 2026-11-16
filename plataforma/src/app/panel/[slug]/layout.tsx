import Link from "next/link";
import { cerrarSesion } from "@/app/acceso/acciones";
import { NOMBRE_ROL } from "@/lib/permisos";
import { contextoPagina } from "@/server/panel/contexto";
import { exigirContrasenaPropia } from "@/server/panel/perfil";
import { Navegacion } from "./navegacion";

// Panel privado: espera a confirmar sesión y permisos antes de mostrar nada.
export const instant = false;

export default async function LayoutRestaurante({ children, params }: LayoutProps<"/panel/[slug]">) {
  const { slug } = await params;
  const { ctx } = await contextoPagina(slug);
  await exigirContrasenaPropia(ctx.supabase, ctx.usuarioId);

  const secciones = [
    ctx.puede("orders.view") && { ruta: "pedidos", nombre: "Pedidos" },
    ctx.puede("tables.manage") && { ruta: "mesas", nombre: "Mesas" },
    ctx.puede("menu.edit") && { ruta: "menu", nombre: "Menú" },
    ctx.puede("settings.edit") && { ruta: "restaurante", nombre: "Restaurante" },
    ctx.puede("staff.manage") && { ruta: "empleados", nombre: "Empleados" },
  ].filter((s): s is { ruta: string; nombre: string } => Boolean(s));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 flex flex-col gap-3 border-b border-linea bg-fondo/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href="/panel" className="text-xs text-tenue hover:text-crema">← Mis restaurantes</Link>
            <h1 className="truncate font-titulo text-xl">{ctx.restaurante.name}</h1>
            <p className="text-xs text-tenue">{NOMBRE_ROL[ctx.rol]}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {ctx.restaurante.status === "active" && (
              <a href={`/r/${slug}`} target="_blank" rel="noopener" className="flex h-10 items-center rounded-xl border border-linea bg-superficie-2 px-3 text-sm font-semibold">
                Ver menú ↗
              </a>
            )}
            <form action={cerrarSesion}>
              <button className="h-10 rounded-xl border border-linea px-3 text-sm font-semibold text-tenue">Salir</button>
            </form>
          </div>
        </div>
        {secciones.length > 0 && <Navegacion slug={slug} secciones={secciones} />}
      </header>
      <div className="pt-6">
        {secciones.length === 0 ? (
          <p className="rounded-xl border border-dashed border-dorado/30 px-4 py-3 text-sm text-tenue">
            Tu usuario todavía no tiene permisos en el panel. Pídele al dueño que te asigne los que necesites.
          </p>
        ) : children}
      </div>
    </div>
  );
}
