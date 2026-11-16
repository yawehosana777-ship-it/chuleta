import type { Metadata } from "next";
import { BotonAccion } from "@/components/panel/controles";
import { SinPermiso } from "@/components/panel/sin-permiso";
import { envPublico } from "@/lib/env";
import { DESCRIPCION_PERMISO, NOMBRE_ROL, type Permiso, type Rol } from "@/lib/permisos";
import { contextoPagina } from "@/server/panel/contexto";
import { cambiarActivo } from "./acciones";
import { FormularioNuevoEmpleado, FormularioPermisos, FormularioRestablecer } from "./formularios";

export const metadata: Metadata = { title: "Empleados" };

type Membresia = { id: string; user_id: string; role: Rol; active: boolean; membership_permissions: { permission: string }[] };

// Página privada: espera a confirmar sesión y permisos.
export const instant = false;

export default async function PaginaEmpleados({ params }: PageProps<"/panel/[slug]/empleados">) {
  const { slug } = await params;
  const { ctx, autorizado } = await contextoPagina(slug, "staff.manage");
  if (!autorizado) return <SinPermiso />;

  const { data: membresias } = await ctx.supabase.from("memberships")
    .select("id, user_id, role, active, membership_permissions(permission)")
    .eq("restaurant_id", ctx.restaurante.id).order("created_at").returns<Membresia[]>();
  const ids = (membresias ?? []).map((m) => m.user_id);
  const { data: perfiles } = ids.length
    ? await ctx.supabase.from("profiles").select("user_id, full_name, username, must_change_password").in("user_id", ids)
    : { data: [] };
  const perfil = (id: string) => perfiles?.find((p) => p.user_id === id);

  const enlaceAcceso = `${envPublico().NEXT_PUBLIC_SITE_URL}/acceso/empleado?r=${slug}`;

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl border border-dorado/30 bg-dorado/5 p-4 text-sm">
        <p className="font-semibold">Cómo entran tus empleados</p>
        <p className="mt-1 text-tenue">Comparte este enlace. Entran con su <b className="text-crema">usuario</b> y <b className="text-crema">contraseña</b> (no necesitan correo):</p>
        <p className="mt-2 break-all rounded-xl bg-superficie px-3 py-2 font-mono text-xs">{enlaceAcceso}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Equipo</h2>
        <ul className="flex flex-col gap-3">
          {membresias?.map((m) => {
            const p = perfil(m.user_id);
            const yo = m.user_id === ctx.usuarioId;
            const administrable = !yo && m.role !== "owner" && (m.role === "staff" || ctx.rol === "owner");
            return (
              <li key={m.id} className={`rounded-2xl border border-linea bg-superficie p-4 ${m.active ? "" : "opacity-70"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{p?.full_name ?? "—"}{yo && <span className="text-tenue"> (tú)</span>}</p>
                    <p className="text-xs text-tenue">
                      {NOMBRE_ROL[m.role]}{p?.username && ` · usuario: ${p.username}`}
                      {!m.active && " · Desactivado"}
                      {m.active && p?.must_change_password && " · Aún no cambia su contraseña temporal"}
                    </p>
                  </div>
                  {administrable && (
                    <BotonAccion accion={cambiarActivo.bind(null, slug, m.id, !m.active)} peligro={m.active}
                      confirmar={m.active ? `¿Desactivar a ${p?.full_name}? Perderá el acceso de inmediato.` : undefined}>
                      {m.active ? "Desactivar" : "Reactivar"}
                    </BotonAccion>
                  )}
                </div>
                {m.role === "staff" && (
                  <p className="mt-2 text-xs text-tenue">
                    Permisos: {m.membership_permissions.length
                      ? m.membership_permissions.map((x) => DESCRIPCION_PERMISO[x.permission as Permiso]?.nombre ?? x.permission).join(", ")
                      : "ninguno"}
                  </p>
                )}
                {administrable && m.active && (
                  <div className="mt-3 flex flex-col gap-2">
                    {m.role === "staff" && (
                      <details className="rounded-xl border border-linea p-3">
                        <summary className="cursor-pointer text-sm font-semibold">Cambiar permisos</summary>
                        <div className="mt-3">
                          <FormularioPermisos slug={slug} membresiaId={m.id} marcados={m.membership_permissions.map((x) => x.permission)} />
                        </div>
                      </details>
                    )}
                    <details className="rounded-xl border border-linea p-3">
                      <summary className="cursor-pointer text-sm font-semibold">Olvidó su contraseña</summary>
                      <div className="mt-3"><FormularioRestablecer slug={slug} membresiaId={m.id} /></div>
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl border border-linea bg-superficie p-4">
        <h2 className="mb-4 font-semibold">Nuevo empleado</h2>
        <FormularioNuevoEmpleado slug={slug} puedeGerentes={ctx.rol === "owner"} />
      </section>
    </div>
  );
}
