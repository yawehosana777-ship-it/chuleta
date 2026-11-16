import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cargando } from "@/components/ui/cargando";
import { Aviso } from "@/components/ui/formulario";
import { TarjetaAcceso } from "@/components/ui/tarjeta-acceso";
import { hashToken, tokenConFormatoValido } from "@/lib/invitaciones";
import { clienteAdmin } from "@/lib/supabase/admin";
import { FormularioInvitacion } from "./formulario-invitacion";

export const metadata: Metadata = { title: "Invitación", robots: { index: false } };

type Vista = { restaurant_name: string; email: string; role: string; expired: boolean; used: boolean };

export default function PaginaInvitacion({ params }: PageProps<"/acceso/invitacion/[token]">) {
  return (
    <Suspense fallback={<Cargando texto="Verificando tu invitación…" />}>
      <Invitacion params={params} />
    </Suspense>
  );
}

async function Invitacion({ params }: Pick<PageProps<"/acceso/invitacion/[token]">, "params">) {
  const { token } = await params;

  let vista: Vista | null = null;
  if (tokenConFormatoValido(token)) {
    const { data } = await clienteAdmin()
      .rpc("invitation_preview", { p_token_hash: hashToken(token) })
      .maybeSingle<Vista>();
    vista = data;
  }

  if (!vista || vista.used || vista.expired) {
    const mensaje = !vista
      ? "Este enlace de invitación no es válido."
      : vista.used
        ? "Esta invitación ya fue utilizada."
        : "Esta invitación venció. Pide una nueva al administrador de la plataforma.";
    return (
      <TarjetaAcceso titulo="Invitación no disponible">
        <Aviso>{mensaje}</Aviso>
        <Link href="/acceso" className="mt-6 inline-block text-sm font-semibold text-dorado underline-offset-4 hover:underline">
          Ir a iniciar sesión
        </Link>
      </TarjetaAcceso>
    );
  }

  return (
    <TarjetaAcceso
      titulo={`Bienvenido a ${vista.restaurant_name}`}
      subtitulo={vista.role === "owner" ? "Crea tu cuenta de dueño para administrar tu restaurante." : "Crea tu cuenta para unirte al equipo."}
    >
      <FormularioInvitacion token={token} email={vista.email} />
    </TarjetaAcceso>
  );
}
