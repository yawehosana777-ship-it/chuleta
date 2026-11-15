"use client";

import { useActionState, useState } from "react";
import { Campo } from "@/components/ui/formulario";
import { Casilla, Guardar, Resultado, Selector } from "@/components/panel/controles";
import { DESCRIPCION_PERMISO, PERMISOS_PERSONAL, type Permiso } from "@/lib/permisos";
import type { EstadoFormulario } from "@/lib/validaciones";
import { cambiarPermisos, crearEmpleado, restablecerContrasena } from "./acciones";

function ListaPermisos({ marcados = [] }: { marcados?: string[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {PERMISOS_PERSONAL.map((p: Permiso) => {
        const d = DESCRIPCION_PERMISO[p];
        return (
          <Casilla key={p} name="permisos" value={p} defaultChecked={marcados.includes(p)} etiqueta={d.nombre}
            detalle={d.fase ? `${d.detalle} (se usa desde la Fase ${d.fase})` : d.detalle} />
        );
      })}
    </div>
  );
}

export function FormularioNuevoEmpleado({ slug, puedeGerentes }: { slug: string; puedeGerentes: boolean }) {
  const [estado, accion] = useActionState(crearEmpleado.bind(null, slug), {});
  // Tras crear uno con éxito, el formulario se vuelve a montar vacío.
  return <CamposNuevoEmpleado key={estado.exito ?? "nuevo"} estado={estado} accion={accion} puedeGerentes={puedeGerentes} />;
}

function CamposNuevoEmpleado({ estado, accion, puedeGerentes }: {
  estado: EstadoFormulario; accion: (datos: FormData) => void; puedeGerentes: boolean;
}) {
  const [rol, setRol] = useState("staff");
  const e = estado.errores;
  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      <Campo etiqueta="Nombre completo" name="nombre" required maxLength={120} error={e?.nombre} />
      <Campo etiqueta="Usuario" name="usuario" required maxLength={40} autoCapitalize="none" autoCorrect="off" spellCheck={false}
        placeholder="Ej. ana.mesera" error={e?.usuario} />
      <Campo etiqueta="Contraseña temporal" name="contrasena" type="text" required minLength={10} maxLength={72} autoComplete="off"
        placeholder="Mínimo 10 caracteres" error={e?.contrasena} />
      <p className="-mt-2 text-xs text-tenue">Dásela en persona. Al entrar por primera vez, el sistema le pedirá cambiarla.</p>
      <Selector etiqueta="Tipo" name="rol" value={rol} onChange={(ev) => setRol(ev.target.value)}>
        <option value="staff">Personal (permisos que tú elijas)</option>
        {puedeGerentes && <option value="manager">Gerente (todos los permisos, incluido administrar empleados)</option>}
      </Selector>
      {rol === "staff" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">Permisos</legend>
          <ListaPermisos />
        </fieldset>
      )}
      <Resultado estado={estado} />
      <Guardar pendiente="Creando…">Crear empleado</Guardar>
    </form>
  );
}

export function FormularioPermisos({ slug, membresiaId, marcados }: { slug: string; membresiaId: string; marcados: string[] }) {
  const [estado, accion] = useActionState(cambiarPermisos.bind(null, slug, membresiaId), {});
  return (
    <form action={accion} className="flex flex-col gap-3">
      <ListaPermisos marcados={marcados} />
      <Resultado estado={estado} />
      <Guardar>Guardar permisos</Guardar>
    </form>
  );
}

export function FormularioRestablecer({ slug, membresiaId }: { slug: string; membresiaId: string }) {
  const [estado, accion] = useActionState(restablecerContrasena.bind(null, slug, membresiaId), {});
  return (
    <form action={accion} className="flex flex-col gap-3" noValidate>
      <Campo etiqueta="Nueva contraseña temporal" name="contrasena" type="text" minLength={10} maxLength={72} autoComplete="off" error={estado.errores?.contrasena} />
      <Resultado estado={estado} />
      <Guardar>Cambiar contraseña</Guardar>
    </form>
  );
}
