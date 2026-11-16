"use client";

import { useActionState, useState } from "react";
import { Casilla, Guardar, Resultado, Selector } from "@/components/panel/controles";
import { Campo } from "@/components/ui/formulario";
import type { EstadoFormulario } from "@/lib/validaciones";
import { guardarPromocion } from "./acciones";

export type CategoriaConProductos = { id: string; name: string; productos: { id: string; name: string }[] };
export type PromocionEditable = {
  id: string; name: string; kind: "percent" | "fixed"; valor: string; desde: string; hasta: string;
  stackable: boolean; active: boolean; productos: string[]; categorias: string[];
};

export function FormularioPromocion({ slug, promo, categorias }: { slug: string; promo?: PromocionEditable; categorias: CategoriaConProductos[] }) {
  const [estado, accion] = useActionState(guardarPromocion.bind(null, slug, promo?.id ?? null), {});
  // Al crear una con éxito, el formulario se vacía.
  return <Campos key={promo ? promo.id : (estado.exito ?? "nueva")} estado={estado} accion={accion} promo={promo} categorias={categorias} />;
}

function Campos({ estado, accion, promo, categorias }: {
  estado: EstadoFormulario; accion: (d: FormData) => void; promo?: PromocionEditable; categorias: CategoriaConProductos[];
}) {
  const [tipo, setTipo] = useState(promo?.kind ?? "percent");
  const [enteras, setEnteras] = useState<string[]>(promo?.categorias ?? []);
  const e = estado.errores;
  const pfx = promo?.id ?? "nueva";
  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      <Campo etiqueta="Nombre" id={`${pfx}-nombre`} name="nombre" required maxLength={120} defaultValue={promo?.name} placeholder="Ej. Martes de chuleta" error={e?.nombre} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Selector etiqueta="Tipo de descuento" id={`${pfx}-tipo`} name="tipo" value={tipo} onChange={(ev) => setTipo(ev.target.value as "percent" | "fixed")}>
          <option value="percent">Porcentaje (%)</option>
          <option value="fixed">Monto fijo (Q menos por unidad)</option>
        </Selector>
        <Campo etiqueta={tipo === "percent" ? "Porcentaje" : "Monto (Q)"} id={`${pfx}-valor`} name="valor" inputMode={tipo === "percent" ? "numeric" : "decimal"}
          defaultValue={promo?.valor} placeholder={tipo === "percent" ? "Ej. 20" : "Ej. 5"} error={e?.valor} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Desde (vacío = desde ya)" id={`${pfx}-desde`} name="desde" type="datetime-local" defaultValue={promo?.desde} error={e?.desde} />
        <Campo etiqueta="Hasta (vacío = sin fin)" id={`${pfx}-hasta`} name="hasta" type="datetime-local" defaultValue={promo?.hasta} />
      </div>
      <p className="-mt-2 text-xs text-tenue">Hora de Guatemala. El descuento es sobre el precio del producto (no sobre los extras) y nunca deja un precio negativo.</p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">¿A qué productos aplica?</legend>
        {e?.productos && <p className="text-sm text-red-300">{e.productos[0]}</p>}
        {categorias.map((c) => {
          const entera = enteras.includes(c.id);
          return (
            <details key={c.id} open={entera || c.productos.some((p) => promo?.productos.includes(p.id))} className="rounded-xl border border-linea p-3">
              <summary className="cursor-pointer text-sm font-semibold">{c.name}</summary>
              <div className="mt-2 flex flex-col gap-2">
                <Casilla name="categorias" value={c.id} checked={entera} etiqueta="Toda la categoría"
                  detalle="Incluye también los productos que agregues después."
                  onChange={(ev) => setEnteras((x) => (ev.target.checked ? [...x, c.id] : x.filter((i) => i !== c.id)))} />
                {!entera && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {c.productos.map((p) => (
                      <Casilla key={p.id} name="productos" value={p.id} defaultChecked={promo?.productos.includes(p.id)} etiqueta={p.name} />
                    ))}
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </fieldset>

      <div className="grid gap-2 sm:grid-cols-2">
        <Casilla name="acumulable" defaultChecked={promo?.stackable ?? false} etiqueta="Acumulable"
          detalle="Se suma con otras promociones acumulables. Si no, solo se aplica la que más descuenta." />
        <Casilla name="activa" defaultChecked={promo?.active ?? true} etiqueta="Activa" detalle="Desmárcala para pausarla sin borrarla." />
      </div>
      <Resultado estado={estado} />
      <Guardar>{promo ? "Guardar cambios" : "Crear promoción"}</Guardar>
    </form>
  );
}
