"use client";

import { useActionState } from "react";
import { Aviso, BotonEnviar, Campo } from "@/components/ui/formulario";
import { iniciarSesionEmpleado } from "./acciones";

export function FormularioAccesoEmpleado({ restaurante }: { restaurante?: string }) {
  const [estado, accion] = useActionState(iniciarSesionEmpleado, {});
  return (
    <form action={accion} className="flex flex-col gap-5" noValidate>
      {estado.error && <Aviso>{estado.error}</Aviso>}
      {restaurante ? (
        <input type="hidden" name="restaurante" value={restaurante} />
      ) : (
        <Campo etiqueta="Código del restaurante" name="restaurante" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          placeholder="Ej. don-chuleta" required error={estado.errores?.restaurante} />
      )}
      <Campo etiqueta="Usuario" name="usuario" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        required error={estado.errores?.usuario} />
      <Campo etiqueta="Contraseña" name="contrasena" type="password" autoComplete="current-password" required error={estado.errores?.contrasena} />
      <BotonEnviar pendiente="Entrando…">Entrar</BotonEnviar>
    </form>
  );
}
