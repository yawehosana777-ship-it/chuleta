"use client";

import { useActionState, useRef, useEffect } from "react";
import { Campo } from "@/components/ui/formulario";
import { AreaTexto, BotonAccion, Casilla, Guardar, Resultado, Selector } from "@/components/panel/controles";
import { ICONOS } from "@/lib/menu/tipos";
import {
  borrarGrupo, borrarOpcion, crearCategoria, guardarCategoria, guardarGrupo, guardarOpcion, guardarProducto,
} from "./acciones";

const NOMBRE_ICONO: Record<(typeof ICONOS)[number], string> = {
  plato: "Plato", carne: "Carne", hamburguesa: "Hamburguesa", alitas: "Alitas", postre: "Postre",
  cerveza: "Cerveza", fria: "Bebida fría", caliente: "Bebida caliente", tequila: "Licor",
};

const centavosATexto = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));

/** Limpia el formulario después de guardar con éxito. */
function useLimpiarAlGuardar(exito: string | undefined) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (exito) ref.current?.reset(); }, [exito]);
  return ref;
}

export function FormularioNuevaCategoria({ slug }: { slug: string }) {
  const [estado, accion] = useActionState(crearCategoria.bind(null, slug), {});
  const ref = useLimpiarAlGuardar(estado.exito);
  return (
    <form ref={ref} action={accion} className="flex flex-col gap-3" noValidate>
      <Campo etiqueta="Nombre" name="nombre" required maxLength={80} placeholder="Ej. Desayunos" error={estado.errores?.nombre} />
      <Selector etiqueta="Ícono" name="icono" defaultValue="plato">
        {ICONOS.map((i) => <option key={i} value={i}>{NOMBRE_ICONO[i]}</option>)}
      </Selector>
      <Resultado estado={estado} />
      <Guardar>Crear categoría</Guardar>
    </form>
  );
}

export function FormularioCategoria({ slug, categoria }: {
  slug: string;
  categoria: { id: string; name: string; description: string | null; icon: string; active: boolean };
}) {
  const [estado, accion] = useActionState(guardarCategoria.bind(null, slug, categoria.id), {});
  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      <Campo etiqueta="Nombre" name="nombre" required maxLength={80} defaultValue={categoria.name} error={estado.errores?.nombre} />
      <AreaTexto etiqueta="Nota" ayuda="opcional" name="descripcion" maxLength={300} defaultValue={categoria.description ?? ""}
        placeholder="Ej. Acompañados de frijoles, papa y tortillas." error={estado.errores?.descripcion} />
      <Selector etiqueta="Ícono" name="icono" defaultValue={categoria.icon}>
        {ICONOS.map((i) => <option key={i} value={i}>{NOMBRE_ICONO[i]}</option>)}
      </Selector>
      <Casilla etiqueta="Visible para los clientes" name="activa" defaultChecked={categoria.active} />
      <Resultado estado={estado} />
      <Guardar />
    </form>
  );
}

export function FormularioProducto({ slug, producto, categorias, categoriaInicial }: {
  slug: string;
  producto: { id: string; name: string; description: string | null; price_cents: number | null; category_id: string; active: boolean; sold_out: boolean; featured: boolean } | null;
  categorias: { id: string; name: string }[];
  categoriaInicial?: string;
}) {
  const [estado, accion] = useActionState(guardarProducto.bind(null, slug, producto?.id ?? null), {});
  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      <Campo etiqueta="Nombre" name="nombre" required maxLength={120} defaultValue={producto?.name} error={estado.errores?.nombre} />
      <Campo etiqueta="Precio (Q)" name="precio" inputMode="decimal" placeholder="Ej. 35.00 · vacío = precio por confirmar"
        defaultValue={centavosATexto(producto?.price_cents ?? null)} error={estado.errores?.precio} />
      <Selector etiqueta="Categoría" name="categoria" defaultValue={producto?.category_id ?? categoriaInicial} error={estado.errores?.categoria}>
        {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Selector>
      <AreaTexto etiqueta="Descripción" ayuda="opcional" name="descripcion" maxLength={600} defaultValue={producto?.description ?? ""}
        placeholder="Ingredientes, tamaño, acompañamientos…" error={estado.errores?.descripcion} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Casilla etiqueta="Visible" detalle="Se muestra en el menú" name="activo" defaultChecked={producto?.active ?? true} />
        <Casilla etiqueta="Agotado" detalle="Se ve, pero no se pide" name="agotado" defaultChecked={producto?.sold_out ?? false} />
        <Casilla etiqueta="Destacado" detalle="Aparece en «Recomendados», al inicio del menú" name="destacado" defaultChecked={producto?.featured ?? false} />
      </div>
      <Resultado estado={estado} />
      <Guardar>{producto ? "Guardar cambios" : "Crear producto"}</Guardar>
    </form>
  );
}

type Grupo = { id: string; name: string; min_select: number; max_select: number; options: { id: string; name: string; price_delta_cents: number }[] };

function FormularioGrupo({ slug, productoId, grupo }: { slug: string; productoId: string; grupo: Grupo | null }) {
  const [estado, accion] = useActionState(guardarGrupo.bind(null, slug, productoId, grupo?.id ?? null), {});
  const ref = useLimpiarAlGuardar(grupo ? undefined : estado.exito);
  return (
    <form ref={ref} action={accion} className="flex flex-col gap-3" noValidate>
      <Campo etiqueta="Pregunta" name="nombre" required maxLength={80} placeholder="Ej. Elige tu cerveza" defaultValue={grupo?.name} error={estado.errores?.nombre} />
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Mínimo" name="minimo" type="number" min={0} max={20} defaultValue={grupo?.min_select ?? 1} error={estado.errores?.minimo} />
        <Campo etiqueta="Máximo" name="maximo" type="number" min={1} max={20} defaultValue={grupo?.max_select ?? 1} error={estado.errores?.maximo} />
      </div>
      <p className="text-xs text-tenue">Mínimo 1 = obligatorio. Máximo 1 = elige solo una.</p>
      <Resultado estado={estado} />
      <Guardar>{grupo ? "Guardar pregunta" : "Agregar pregunta"}</Guardar>
    </form>
  );
}

function FormularioOpcion({ slug, grupoId, opcion }: { slug: string; grupoId: string; opcion: Grupo["options"][number] | null }) {
  const [estado, accion] = useActionState(guardarOpcion.bind(null, slug, grupoId, opcion?.id ?? null), {});
  const ref = useLimpiarAlGuardar(opcion ? undefined : estado.exito);
  return (
    <form ref={ref} action={accion} className="flex flex-wrap items-end gap-2" noValidate>
      <div className="min-w-36 flex-1">
        <Campo etiqueta={opcion ? "Opción" : "Nueva opción"} name="nombre" required maxLength={80} defaultValue={opcion?.name} placeholder="Ej. Corona" error={estado.errores?.nombre} />
      </div>
      <div className="w-28">
        <Campo etiqueta="Extra (Q)" name="extra" inputMode="decimal" defaultValue={opcion ? centavosATexto(opcion.price_delta_cents) : "0"} error={estado.errores?.extra} />
      </div>
      <Guardar>{opcion ? "Guardar" : "Agregar"}</Guardar>
      {estado.error && <div className="w-full"><Resultado estado={{ error: estado.error }} /></div>}
    </form>
  );
}

export function EditorOpciones({ slug, productoId, grupos }: { slug: string; productoId: string; grupos: Grupo[] }) {
  return (
    <div className="flex flex-col gap-4">
      {grupos.map((g) => (
        <div key={g.id} className="flex flex-col gap-4 rounded-2xl border border-linea bg-superficie p-4">
          <FormularioGrupo slug={slug} productoId={productoId} grupo={g} />
          <div className="flex flex-col gap-3 border-t border-linea pt-4">
            {g.options.map((o) => (
              <div key={o.id} className="flex items-end gap-2">
                <div className="flex-1"><FormularioOpcion slug={slug} grupoId={g.id} opcion={o} /></div>
                <BotonAccion accion={borrarOpcion.bind(null, slug, o.id)} confirmar={`¿Borrar la opción "${o.name}"?`} peligro>Borrar</BotonAccion>
              </div>
            ))}
            <FormularioOpcion slug={slug} grupoId={g.id} opcion={null} />
          </div>
          <div>
            <BotonAccion accion={borrarGrupo.bind(null, slug, g.id)} confirmar={`¿Borrar la pregunta "${g.name}" y sus opciones?`} peligro>
              Borrar pregunta
            </BotonAccion>
          </div>
        </div>
      ))}
      <details className="rounded-2xl border border-dashed border-linea p-4">
        <summary className="cursor-pointer text-sm font-semibold text-dorado">+ Agregar una pregunta (ej. &quot;Elige tu cerveza&quot;)</summary>
        <div className="mt-4"><FormularioGrupo slug={slug} productoId={productoId} grupo={null} /></div>
      </details>
    </div>
  );
}
