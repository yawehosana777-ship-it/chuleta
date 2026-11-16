"use client";

import { useActionState } from "react";
import { BotonAccion, Guardar, Resultado, Selector } from "@/components/panel/controles";
import { Campo } from "@/components/ui/formulario";
import type { EstadoFormulario } from "@/lib/validaciones";
import { borrarArea, crearArea, guardarOperacion } from "./acciones";

type Area = { id: string; name: string };
type Categoria = { id: string; name: string; area_id: string | null };

export function SeccionOperacion({ slug, areas, categorias, aceptar, preparar }: {
  slug: string; areas: Area[]; categorias: Categoria[]; aceptar: number; preparar: number;
}) {
  const [estado, accion] = useActionState(guardarOperacion.bind(null, slug), {});
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Áreas de preparación</p>
        <p className="text-xs text-tenue">Por ejemplo «Cocina» y «Barra». En la pantalla Cocina, cada área ve solo lo suyo.</p>
        <ul className="flex flex-wrap gap-2">
          {areas.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-xl border border-linea bg-superficie-2 py-1 pl-3 pr-1 text-sm">
              {a.name}
              <BotonAccion accion={borrarArea.bind(null, slug, a.id)} peligro confirmar={`¿Borrar el área «${a.name}»? Sus categorías quedarán sin área.`}>
                Borrar
              </BotonAccion>
            </li>
          ))}
          {areas.length === 0 && <li className="text-sm text-tenue">Aún no hay áreas.</li>}
        </ul>
        <NuevaArea slug={slug} />
      </div>

      <form action={accion} className="flex flex-col gap-4" noValidate>
        {areas.length > 0 && (
          // Al guardar, el formulario se reinicia; con esta clave las listas se vuelven a crear con lo ya guardado.
          <fieldset key={categorias.map((c) => c.area_id ?? "-").join()} className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">¿Dónde se prepara cada categoría?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {categorias.map((c) => (
                <Selector key={c.id} etiqueta={c.name} name={`cat-${c.id}`} defaultValue={c.area_id ?? ""}>
                  <option value="">Sin área (se ve en todas)</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Selector>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold">Avisos de atraso (minutos)</legend>
          <Campo etiqueta="Pedido nuevo sin aceptar" name="aceptar" type="number" min={1} max={120} defaultValue={aceptar} error={estado.errores?.aceptar} />
          <Campo etiqueta="Aceptado y aún no listo" name="preparar" type="number" min={1} max={240} defaultValue={preparar} error={estado.errores?.preparar} />
        </fieldset>
        <p className="-mt-2 text-xs text-tenue">Pasado ese tiempo, el pedido se marca «Atrasado» en rojo; los nuevos sin aceptar vuelven a sonar cada minuto.</p>
        <Resultado estado={estado} />
        <Guardar>Guardar áreas y avisos</Guardar>
      </form>
    </div>
  );
}

function NuevaArea({ slug }: { slug: string }) {
  const [estado, accion] = useActionState(crearArea.bind(null, slug), {});
  return <CamposArea key={estado.exito ?? "nueva"} estado={estado} accion={accion} />;
}

function CamposArea({ estado, accion }: { estado: EstadoFormulario; accion: (d: FormData) => void }) {
  return (
    <form action={accion} className="flex flex-col gap-2" noValidate>
      <div className="flex items-end gap-2">
        <div className="flex-1"><Campo etiqueta="Nueva área" name="area" maxLength={60} placeholder="Ej. Barra" error={estado.errores?.area} /></div>
        <Guardar pendiente="Creando…">Crear</Guardar>
      </div>
      {estado.error && <Resultado estado={estado} />}
    </form>
  );
}
