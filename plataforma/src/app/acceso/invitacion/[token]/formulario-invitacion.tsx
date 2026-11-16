"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Aviso, BotonEnviar, Campo } from "@/components/ui/formulario";
import { aceptarInvitacion } from "./acciones";

export function FormularioInvitacion({ token, email }: { token: string; email: string }) {
  const [estado, accion] = useActionState(aceptarInvitacion.bind(null, token), {});
  if (estado.exito) {
    return (
      <div className="flex flex-col gap-5">
        <Aviso tipo="info">{estado.exito}</Aviso>
        <Link href="/acceso" className="text-sm font-semibold text-dorado underline-offset-4 hover:underline">
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }
  return (
    <form action={accion} className="flex flex-col gap-5" noValidate>
      {estado.error && <Aviso>{estado.error}</Aviso>}
      <Campo etiqueta="Correo" name="email_vista" type="email" value={email} readOnly />
      <Campo etiqueta="Tu nombre completo" name="nombre" autoComplete="name" required error={estado.errores?.nombre} />
      <Campo
        etiqueta="Crea una contraseña"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        error={estado.errores?.password}
      />
      <Campo
        etiqueta="Repite la contraseña"
        name="confirmar"
        type="password"
        autoComplete="new-password"
        required
        error={estado.errores?.confirmar}
      />
      <p className="-mt-2 text-xs text-tenue">Mínimo 10 caracteres. Usa una frase que solo tú conozcas.</p>
      <BotonEnviar pendiente="Creando tu cuenta…">Crear cuenta y entrar</BotonEnviar>
    </form>
  );
}
