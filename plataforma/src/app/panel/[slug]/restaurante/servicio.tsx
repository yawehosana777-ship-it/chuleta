"use client";

import { useActionState, useState } from "react";
import { Casilla, Guardar, Resultado } from "@/components/panel/controles";
import { Campo } from "@/components/ui/formulario";
import { DIAS } from "@/lib/pedidos-textos";
import { guardarServicio } from "./acciones";

type Dia = { abre: boolean; desde: string; hasta: string };

type Entrega = { activo: boolean; zona: string; envio: string; minimo: string };

export function FormularioServicio({ slug, mesa, domicilio, horario }: { slug: string; mesa: boolean; domicilio: Entrega; horario: Dia[] }) {
  const [estado, accion] = useActionState(guardarServicio.bind(null, slug), {});
  const [dias, setDias] = useState(horario);
  const [conDomicilio, setConDomicilio] = useState(domicilio.activo);
  const cambiar = (d: number, c: Partial<Dia>) => setDias((ds) => ds.map((x, i) => (i === d ? { ...x, ...c } : x)));
  const e = estado.errores;

  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      <Casilla name="mesa" defaultChecked={mesa} etiqueta="Recibir pedidos en mesa"
        detalle="Los clientes piden desde su teléfono escaneando el código QR de la mesa." />
      <Casilla name="domicilio" checked={conDomicilio} onChange={(ev) => setConDomicilio(ev.target.checked)} etiqueta="Recibir pedidos a domicilio"
        detalle="Desde la página del menú. El cliente deja nombre, teléfono y dirección, y paga en efectivo al recibir." />
      {conDomicilio && (
        <div className="flex flex-col gap-3 rounded-xl border border-linea p-3">
          <Campo etiqueta="Zona de entrega" name="zona" maxLength={120} defaultValue={domicilio.zona}
            placeholder="Ej. Solo Malacatancito" error={e?.zona} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Costo de envío (Q)" name="envio" inputMode="decimal" defaultValue={domicilio.envio}
              placeholder="Vacío = gratis" error={e?.envio} />
            <Campo etiqueta="Pedido mínimo (Q)" name="minimo" inputMode="decimal" defaultValue={domicilio.minimo}
              placeholder="Vacío = sin mínimo" error={e?.minimo} />
          </div>
        </div>
      )}
      {!conDomicilio && (
        <>
          <input type="hidden" name="zona" value={domicilio.zona} />
          <input type="hidden" name="envio" value={domicilio.envio} />
          <input type="hidden" name="minimo" value={domicilio.minimo} />
        </>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Horario de atención (mesa y domicilio)</legend>
        <p className="mb-1 text-xs text-tenue">
          Solo se reciben pedidos dentro de este horario (hora de Guatemala). Si cierras después de medianoche,
          pon la hora de cierre del día siguiente (por ejemplo, de 18:00 a 02:00).
        </p>
        {DIAS.map((nombre, d) => {
          const error = estado.errores?.[`dia-${d}`]?.[0];
          return (
            <div key={nombre} className={`flex flex-wrap items-center gap-3 rounded-xl border bg-superficie px-3 py-2 ${error ? "border-red-400/60" : "border-linea"}`}>
              <label className="flex w-32 items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name={`abre-${d}`} checked={dias[d].abre} onChange={(e) => cambiar(d, { abre: e.target.checked })}
                  className="size-5 accent-[var(--dorado)]" />
                {nombre}
              </label>
              {dias[d].abre ? (
                <span className="flex items-center gap-2 text-sm">
                  <input type="time" name={`desde-${d}`} value={dias[d].desde} onChange={(e) => cambiar(d, { desde: e.target.value })} required
                    aria-label={`${nombre}: abre`} className="h-10 rounded-lg border border-linea bg-superficie-2 px-2" />
                  a
                  <input type="time" name={`hasta-${d}`} value={dias[d].hasta} onChange={(e) => cambiar(d, { hasta: e.target.value })} required
                    aria-label={`${nombre}: cierra`} className="h-10 rounded-lg border border-linea bg-superficie-2 px-2" />
                </span>
              ) : (
                <span className="text-sm text-tenue">Cerrado</span>
              )}
              {error && <p className="w-full text-xs text-red-300">{error}</p>}
            </div>
          );
        })}
      </fieldset>

      <Resultado estado={estado} />
      <Guardar>Guardar pedidos y horario</Guardar>
    </form>
  );
}
