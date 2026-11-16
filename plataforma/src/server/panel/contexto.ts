import "server-only";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { permisosEfectivos, type Permiso, type Rol } from "@/lib/permisos";
import { clienteServidor } from "@/lib/supabase/servidor";

export type ContextoPanel = Awaited<ReturnType<typeof cargarContexto>>;

/**
 * Restaurante y permisos del usuario que tiene la sesión.
 * El slug de la URL solo ELIGE entre los restaurantes del usuario: si no es
 * miembro activo, no existe para él. El id del restaurante nunca viene del navegador.
 */
async function cargarContexto(slug: string) {
  // El panel es privado: siempre en el momento de la petición, nunca preparado de antemano.
  await connection();
  const supabase = await clienteServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data: m } = await supabase
    .from("memberships")
    .select("id, role, restaurants!inner(id, slug, name, status), membership_permissions(permission)")
    .eq("user_id", auth.user.id)
    .eq("active", true)
    .eq("restaurants.slug", slug)
    .neq("restaurants.status", "suspended")
    .maybeSingle<{
      id: string;
      role: Rol;
      restaurants: { id: string; slug: string; name: string; status: string };
      membership_permissions: { permission: string }[];
    }>();
  if (!m) return null;

  const permisos = permisosEfectivos(m.role, m.membership_permissions.map((p) => p.permission));
  return {
    supabase,
    usuarioId: auth.user.id,
    membresiaId: m.id,
    rol: m.role,
    permisos,
    restaurante: m.restaurants,
    puede: (p: Permiso) => permisos.has(p),
  };
}

/** Para páginas: sin sesión → acceso; sin membresía → 404; sin permiso → aviso. */
export async function contextoPagina(slug: string, permiso?: Permiso) {
  const ctx = await cargarContexto(slug);
  if (!ctx) {
    const supabase = await clienteServidor();
    const { data } = await supabase.auth.getUser();
    if (!data.user) redirect(`/acceso?siguiente=/panel/${slug}`);
    notFound();
  }
  return { ctx, autorizado: !permiso || ctx.puede(permiso) };
}

export class NoAutorizado extends Error {
  constructor() {
    super("No autorizado");
  }
}

/** Para acciones del servidor: lanza NoAutorizado si falta sesión, membresía o permiso. */
export async function contextoAccion(slug: unknown, permiso: Permiso) {
  if (typeof slug !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new NoAutorizado();
  const ctx = await cargarContexto(slug);
  if (!ctx || !ctx.puede(permiso)) throw new NoAutorizado();
  return ctx;
}
