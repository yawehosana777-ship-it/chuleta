"use client";

import { useActionState } from "react";
import { Campo } from "@/components/ui/formulario";
import { Guardar, Resultado } from "@/components/panel/controles";
import { cancelarPedido } from "./acciones";

export function FormularioCancelar({ slug, pedidoId, version }: { slug: string; pedidoId: string; version: number }) {
  const [estado, accion] = useActionState(cancelarPedido.bind(null, slug, pedidoId, version), {});
  return (
    <form action={accion} className="flex flex-col gap-3" noValidate>
      <Campo etiqueta="Motivo" name="motivo" required maxLength={500} placeholder="Ej. el cliente ya no lo quiere" error={estado.errores?.motivo} />
      <Resultado estado={estado} />
      <Guardar pendiente="Cancelando…">Cancelar pedido</Guardar>
    </form>
  );
}
