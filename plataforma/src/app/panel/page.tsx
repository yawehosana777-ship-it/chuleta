import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { cerrarSesion } from "@/app/acceso/acciones";

export const metadata: Metadata = { title: "Panel" };

const ROLES: Record<string, string> = { owner: "Dueño", manager: "Gerente", staff: "Personal" };
const ESTADOS: Record<string, string> = { active: "Activo", pending: "Pendiente", suspended: "Suspendido" };

type Membresia = {
  role: string;
  restaurants: { name: string; slug: string; status: string } | null;
};

export default async function PaginaPanel() {
  // Siempre en el momento de la petición: depende de la sesión del usuario.
  await connection();
  const supabase = await clienteServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/acceso?siguiente=/panel");

  // Estas consultas pasan por RLS: solo devuelven lo que este usuario puede ver.
  const [{ data: perfil }, { data: membresias, error }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("user_id", auth.user.id).maybeSingle(),
    supabase
      .from("memberships")
      .select("role, restaurants(name, slug, status)")
      .eq("user_id", auth.user.id)
      .eq("active", true)
      .returns<Membresia[]>(),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-tenue">Hola,</p>
          <h1 className="font-titulo text-2xl">{perfil?.full_name ?? auth.user.email}</h1>
        </div>
        <form action={cerrarSesion}>
          <button className="h-11 rounded-xl border border-linea bg-superficie-2 px-4 text-sm font-semibold">Cerrar sesión</button>
        </form>
      </header>

      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-widest text-dorado">Tus restaurantes</h2>
        {error && <p className="mt-4 text-sm text-red-300">No pudimos cargar tus restaurantes. Recarga la página.</p>}
        {!error && !membresias?.length && (
          <p className="mt-4 text-sm text-tenue">Tu cuenta todavía no está asignada a ningún restaurante.</p>
        )}
        <ul className="mt-4 grid gap-3">
          {membresias?.map((m) => (
            <li key={m.restaurants?.slug} className="rounded-2xl border border-linea bg-superficie p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-lg font-semibold">{m.restaurants?.name}</p>
                <span className="rounded-full bg-guinda/50 px-3 py-1 text-xs font-semibold">{ROLES[m.role] ?? m.role}</span>
              </div>
              <p className="mt-1 text-sm text-tenue">
                /r/{m.restaurants?.slug} · {ESTADOS[m.restaurants?.status ?? ""] ?? m.restaurants?.status}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10 rounded-xl border border-dashed border-dorado/30 px-4 py-3 text-sm text-tenue">
        Fase 1: el inicio de sesión y el aislamiento entre restaurantes ya funcionan. La administración del menú,
        pedidos y empleados llega en las Fases 3 a 5.
      </p>
    </main>
  );
}
