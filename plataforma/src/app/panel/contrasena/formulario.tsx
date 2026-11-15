"use client";

import { useActionState } from "react";
import { Aviso, BotonEnviar, Campo } from "@/components/ui/formulario";
import { cambiarMiContrasena } from "./acciones";

export function FormularioContrasena() {
  const [estado, accion] = useActionState(cambiarMiContrasena, {});
  return (
    <form action={accion} className="flex flex-col gap-5" noValidate>
      {estado.error && <Aviso>{estado.error}</Aviso>}
      <Campo etiqueta="Nueva contraseña" name="contrasena" type="password" autoComplete="new-password" minLength={10} required
        error={estado.errores?.contrasena} />
      <Campo etiqueta="Repite la contraseña" name="confirmar" type="password" autoComplete="new-password" required
        error={estado.errores?.confirmar} />
      <BotonEnviar pendiente="Guardando…">Guardar y entrar</BotonEnviar>
    </form>
  );
}
