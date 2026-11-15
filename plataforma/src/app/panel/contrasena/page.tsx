import type { Metadata } from "next";
import { TarjetaAcceso } from "@/components/ui/tarjeta-acceso";
import { FormularioContrasena } from "./formulario";

export const metadata: Metadata = { title: "Cambiar contraseña" };

export default function PaginaContrasena() {
  return (
    <TarjetaAcceso titulo="Elige tu contraseña" subtitulo="Por seguridad, cambia la contraseña temporal por una que solo tú conozcas.">
      <FormularioContrasena />
    </TarjetaAcceso>
  );
}
