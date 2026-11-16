"use client";

import { useActionState } from "react";
import { Campo } from "@/components/ui/formulario";
import { Guardar, Resultado } from "@/components/panel/controles";
import type { EstadoFormulario } from "@/lib/validaciones";
import { crearMesa } from "./acciones";

export function FormularioMesa({ slug, sugerencia }: { slug: string; sugerencia: string }) {
  const [estado, accion] = useActionState(crearMesa.bind(null, slug), {});
  // Tras crear una, el campo se vacía y sugiere el siguiente número.
  return <Campos key={estado.exito ?? "nueva"} estado={estado} accion={accion} sugerencia={sugerencia} />;
}

function Campos({ estado, accion, sugerencia }: { estado: EstadoFormulario; accion: (d: FormData) => void; sugerencia: string }) {
  return (
    <form action={accion} className="flex flex-col gap-3" noValidate>
      <Campo etiqueta="Nombre de la mesa" name="nombre" required maxLength={40} defaultValue={sugerencia}
        placeholder="Ej. Mesa 1, Terraza 2" error={estado.errores?.nombre} />
      <Resultado estado={estado} />
      <Guardar pendiente="Creando…">Crear mesa</Guardar>
    </form>
  );
}
