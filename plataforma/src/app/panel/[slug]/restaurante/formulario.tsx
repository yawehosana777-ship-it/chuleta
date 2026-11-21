"use client";

import { useActionState } from "react";
import { Campo } from "@/components/ui/formulario";
import { AreaTexto, Guardar, Resultado, Selector } from "@/components/panel/controles";
import { PLANTILLAS, type NombrePlantilla } from "@/lib/menu/temas";
import { guardarRestaurante } from "./acciones";

export type DatosRestaurante = {
  name: string; description: string | null; address: string | null; phone: string | null; whatsapp: string | null;
  plantilla: NombrePlantilla; lema: string; etiquetas: string[]; acento: string; resalte: string;
};

export function FormularioRestaurante({ slug, r }: { slug: string; r: DatosRestaurante }) {
  const [estado, accion] = useActionState(guardarRestaurante.bind(null, slug), {});
  const e = estado.errores;
  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      <Campo etiqueta="Nombre del restaurante" name="nombre" required maxLength={120} defaultValue={r.name} error={e?.nombre} />
      <AreaTexto etiqueta="Descripción" ayuda="opcional" name="descripcion" maxLength={1000} defaultValue={r.description ?? ""} error={e?.descripcion} />
      <Campo etiqueta="Dirección" name="direccion" maxLength={300} defaultValue={r.address ?? ""} error={e?.direccion} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Teléfono" name="telefono" type="tel" maxLength={30} defaultValue={r.phone ?? ""} error={e?.telefono} />
        <Campo etiqueta="WhatsApp para pedidos" name="whatsapp" type="tel" maxLength={30} placeholder="5555-1234"
          defaultValue={r.whatsapp ?? ""} error={e?.whatsapp} />
      </div>
      <p className="-mt-2 text-xs text-tenue">
        Con un número de WhatsApp, el menú muestra el botón «Pedir por WhatsApp»: el cliente envía su pedido ya escrito a ese número.
        Si lo dejas vacío, se usa el sistema de pedidos del panel.
      </p>
      <Campo etiqueta="Lema" name="lema" maxLength={80} defaultValue={r.lema} placeholder="Ej. Al gusto de nuestros clientes" error={e?.lema} />
      <Campo etiqueta="Especialidades (separadas por coma)" name="etiquetas" defaultValue={r.etiquetas.join(", ")}
        placeholder="Carnes, Hamburguesas, Cervezas" error={e?.etiquetas} />

      <fieldset className="flex flex-col gap-4 rounded-2xl border border-linea p-4">
        <legend className="px-2 text-sm font-semibold">Apariencia del menú</legend>
        <Selector etiqueta="Plantilla" name="plantilla" defaultValue={r.plantilla}>
          {(Object.keys(PLANTILLAS) as NombrePlantilla[]).map((k) => <option key={k} value={k}>{PLANTILLAS[k].nombre}</option>)}
        </Selector>
        <div className="grid grid-cols-2 gap-4">
          <ColorOpcional nombre="acento" etiqueta="Color principal" valor={r.acento} porDefecto={PLANTILLAS[r.plantilla].colores.acento} />
          <ColorOpcional nombre="resalte" etiqueta="Color de precios" valor={r.resalte} porDefecto={PLANTILLAS[r.plantilla].colores.resalte} />
        </div>
        <p className="text-xs text-tenue">Si no eliges colores, se usan los de la plantilla.</p>
      </fieldset>

      <Resultado estado={estado} />
      <Guardar />
    </form>
  );
}

function ColorOpcional({ nombre, etiqueta, valor, porDefecto }: { nombre: string; etiqueta: string; valor: string; porDefecto: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      {etiqueta}
      <span className="flex items-center gap-2">
        <input type="color" name={nombre} defaultValue={valor || porDefecto} className="h-12 w-16 cursor-pointer rounded-xl border border-linea bg-superficie p-1" />
        <span className="text-xs font-normal text-tenue">{valor ? "Personalizado" : "De la plantilla"}</span>
      </span>
    </label>
  );
}
