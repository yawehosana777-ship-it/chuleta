"use client";

import { useActionState } from "react";
import { Aviso, BotonEnviar, Campo } from "@/components/ui/formulario";
import { iniciarSesion } from "./acciones";

export function FormularioAcceso({ siguiente }: { siguiente?: string }) {
  const [estado, accion] = useActionState(iniciarSesion, {});
  return (
    <form action={accion} className="flex flex-col gap-5" noValidate>
      {estado.error && <Aviso>{estado.error}</Aviso>}
      <input type="hidden" name="siguiente" value={siguiente ?? ""} />
      <Campo etiqueta="Correo" name="email" type="email" autoComplete="email" inputMode="email" required error={estado.errores?.email} />
      <Campo etiqueta="Contraseña" name="password" type="password" autoComplete="current-password" required error={estado.errores?.password} />
      <BotonEnviar pendiente="Entrando…">Entrar</BotonEnviar>
    </form>
  );
}
