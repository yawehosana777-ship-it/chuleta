import type { Metadata } from "next";
import { TarjetaAcceso } from "@/components/ui/tarjeta-acceso";
import { FormularioAcceso } from "./formulario-acceso";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function PaginaAcceso({ searchParams }: PageProps<"/acceso">) {
  const { siguiente } = await searchParams;
  return (
    <TarjetaAcceso titulo="Iniciar sesión" subtitulo="Panel de tu restaurante">
      <FormularioAcceso siguiente={typeof siguiente === "string" ? siguiente : undefined} />
    </TarjetaAcceso>
  );
}
