"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import type { EstadoFormulario } from "@/lib/validaciones";
import { Confirmacion, Resultado } from "./controles";

const LADO_MAXIMO = 1600;

/** Reduce la foto en el teléfono (máx. 1600 px, WebP) para que suba rápido. */
async function reducir(archivo: File): Promise<Blob> {
  const imagen = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  lienzo.getContext("2d")!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  imagen.close();
  const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, "image/webp", 0.82));
  if (blob && blob.type === "image/webp") return blob;
  return new Promise<Blob>((r, f) => lienzo.toBlob((b) => (b ? r(b) : f(new Error("No se pudo procesar la foto"))), "image/jpeg", 0.85));
}

export function SubirFoto({ actual, etiqueta = "Foto", subir, quitar, alto = "h-44" }: {
  actual: string | null;
  etiqueta?: string;
  subir: (datos: FormData) => Promise<EstadoFormulario>;
  quitar?: () => Promise<EstadoFormulario>;
  alto?: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoFormulario>({});
  const [pendiente, iniciar] = useTransition();
  const [preguntando, setPreguntando] = useState(false);
  const mostrar = vista ?? actual;

  function elegir(archivo: File | undefined) {
    if (!archivo) return;
    if (!archivo.type.startsWith("image/")) { setEstado({ error: "Elige un archivo de imagen." }); return; }
    setEstado({});
    iniciar(async () => {
      try {
        const reducida = await reducir(archivo);
        setVista(URL.createObjectURL(reducida));
        const datos = new FormData();
        datos.set("foto", new File([reducida], reducida.type === "image/webp" ? "foto.webp" : "foto.jpg", { type: reducida.type }));
        const r = await subir(datos);
        setEstado(r);
        if (r.error) setVista(null);
      } catch {
        setEstado({ error: "No se pudo leer la foto. Prueba con otra." });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold">{etiqueta}</span>
      <div className={`relative ${alto} overflow-hidden rounded-2xl border border-dashed border-linea bg-superficie`}>
        {mostrar ? (
          <Image src={mostrar} alt={etiqueta} fill sizes="(min-width: 768px) 600px, 100vw" className="object-cover" unoptimized={Boolean(vista)} />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-sm text-tenue">Sin foto</span>
        )}
        {pendiente && <span className="absolute inset-0 grid place-items-center bg-fondo/70 text-sm font-semibold">Subiendo…</span>}
      </div>
      <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1}
        onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pendiente} onClick={() => entrada.current?.click()}
          className="min-h-10 rounded-xl border border-linea bg-superficie-2 px-4 text-sm font-semibold disabled:opacity-50">
          {mostrar ? "Cambiar foto" : "Subir foto"}
        </button>
        {quitar && actual && !preguntando && (
          <button type="button" disabled={pendiente} onClick={() => setPreguntando(true)}
            className="min-h-10 rounded-xl border border-red-400/40 px-4 text-sm font-semibold text-red-200 disabled:opacity-50">
            Quitar
          </button>
        )}
      </div>
      {quitar && preguntando && (
        <Confirmacion pregunta="¿Quitar esta foto?" si="Sí, quitar" onNo={() => setPreguntando(false)}
          onSi={() => { setPreguntando(false); iniciar(async () => { setVista(null); setEstado(await quitar()); }); }} />
      )}
      <Resultado estado={estado} />
    </div>
  );
}
