import type { Metadata } from "next";
import Link from "next/link";
import { TarjetaAcceso } from "@/components/ui/tarjeta-acceso";
import { clientePublico } from "@/lib/supabase/publico";
import { FormularioAccesoEmpleado } from "./formulario";

export const metadata: Metadata = { title: "Acceso de empleados", robots: { index: false } };
// Lee el restaurante del enlace al momento: es una pantalla corta, sin nada que preparar de antemano.
export const instant = false;

export default async function PaginaAccesoEmpleado({ searchParams }: PageProps<"/acceso/empleado">) {
  const { r } = await searchParams;
  const slug = typeof r === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(r) ? r : undefined;
  // Solo para mostrar el nombre; la sesión se valida al entrar.
  const { data } = slug
    ? await clientePublico().from("restaurants").select("name").eq("slug", slug).eq("status", "active").maybeSingle()
    : { data: null };

  return (
    <TarjetaAcceso titulo={data?.name ?? "Acceso de empleados"} subtitulo="Entra con el usuario y la contraseña que te dio el dueño.">
      <FormularioAccesoEmpleado restaurante={data ? slug : undefined} />
      <p className="mt-6 text-center text-sm text-tenue">
        ¿Eres el dueño? <Link href="/acceso" className="font-semibold text-dorado">Entra con tu correo</Link>
      </p>
    </TarjetaAcceso>
  );
}
