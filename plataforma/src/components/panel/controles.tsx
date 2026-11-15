"use client";

import { useState, useTransition, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import type { EstadoFormulario } from "@/lib/validaciones";

const caja =
  "rounded-xl border border-linea bg-superficie px-4 text-base text-crema outline-none transition placeholder:text-tenue focus:border-dorado/60 focus:bg-superficie-2 aria-invalid:border-red-400/70";

function Etiqueta({ id, children, ayuda }: { id: string; children: ReactNode; ayuda?: string }) {
  return (
    <label htmlFor={id} className="text-sm font-semibold text-crema">
      {children}
      {ayuda && <span className="ml-1 font-normal text-tenue">· {ayuda}</span>}
    </label>
  );
}

function ErrorCampo({ id, error }: { id: string; error?: string[] }) {
  return error?.length ? <p id={`${id}-error`} className="text-sm text-red-300">{error[0]}</p> : null;
}

export function AreaTexto({ etiqueta, ayuda, error, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { etiqueta: string; ayuda?: string; error?: string[] }) {
  const id = props.id ?? props.name!;
  return (
    <div className="flex flex-col gap-1.5">
      <Etiqueta id={id} ayuda={ayuda}>{etiqueta}</Etiqueta>
      <textarea id={id} rows={3} aria-invalid={Boolean(error?.length)} aria-describedby={error?.length ? `${id}-error` : undefined}
        className={`${caja} py-3`} {...props} />
      <ErrorCampo id={id} error={error} />
    </div>
  );
}

export function Selector({ etiqueta, ayuda, error, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { etiqueta: string; ayuda?: string; error?: string[] }) {
  const id = props.id ?? props.name!;
  return (
    <div className="flex flex-col gap-1.5">
      <Etiqueta id={id} ayuda={ayuda}>{etiqueta}</Etiqueta>
      <select id={id} aria-invalid={Boolean(error?.length)} className={`${caja} h-12`} {...props}>{children}</select>
      <ErrorCampo id={id} error={error} />
    </div>
  );
}

export function Casilla({ etiqueta, detalle, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; detalle?: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-linea bg-superficie px-4 py-2 has-[:checked]:border-dorado/50">
      <input type="checkbox" className="size-5 accent-[var(--dorado)]" {...props} />
      <span className="flex flex-col">
        <span className="text-sm font-semibold">{etiqueta}</span>
        {detalle && <span className="text-xs text-tenue">{detalle}</span>}
      </span>
    </label>
  );
}

export function Guardar({ children = "Guardar", pendiente = "Guardando…" }: { children?: ReactNode; pendiente?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending}
      className="flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-guinda-2 to-guinda px-6 font-bold text-crema transition active:scale-[.98] disabled:opacity-70">
      {pending && <span className="size-4 animate-spin rounded-full border-2 border-crema/40 border-t-crema" aria-hidden />}
      {pending ? pendiente : children}
    </button>
  );
}

/** Mensaje del resultado de una acción (éxito o error). */
export function Resultado({ estado }: { estado: EstadoFormulario }) {
  if (estado.error) return <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{estado.error}</p>;
  if (estado.exito) return <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{estado.exito}</p>;
  return null;
}

/** Botón que ejecuta una acción del servidor (con confirmación opcional). */
export function BotonAccion({ accion, children, confirmar, peligro, className = "" }: {
  accion: () => Promise<EstadoFormulario | void>; children: ReactNode; confirmar?: string; peligro?: boolean; className?: string;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button type="button" disabled={pendiente} aria-busy={pendiente}
        onClick={() => {
          if (confirmar && !window.confirm(confirmar)) return;
          setError(null);
          iniciar(async () => {
            const r = await accion();
            if (r && r.error) setError(r.error);
          });
        }}
        className={`min-h-10 rounded-xl border px-3 text-sm font-semibold transition disabled:opacity-50 ${
          peligro ? "border-red-400/40 text-red-200 hover:bg-red-500/10" : "border-linea bg-superficie-2 hover:border-dorado/40"
        } ${className}`}>
        {children}
      </button>
      {error && <span role="alert" className="mt-1 text-xs text-red-300">{error}</span>}
    </span>
  );
}

/** Interruptor (agotado / visible) que guarda al tocarlo. */
export function Interruptor({ etiqueta, activo, accion, colorActivo = "bg-dorado" }: {
  etiqueta: string; activo: boolean; accion: (valor: boolean) => Promise<EstadoFormulario>; colorActivo?: string;
}) {
  const [valor, setValor] = useState(activo);
  const [pendiente, iniciar] = useTransition();
  return (
    <button type="button" role="switch" aria-checked={valor} aria-label={etiqueta} disabled={pendiente}
      onClick={() => {
        const nuevo = !valor;
        setValor(nuevo);
        iniciar(async () => {
          const r = await accion(nuevo);
          if (r.error) { setValor(!nuevo); window.alert(r.error); }
        });
      }}
      className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-semibold text-tenue disabled:opacity-60">
      <span className={`relative h-6 w-10 rounded-full transition ${valor ? colorActivo : "bg-superficie-2 border border-linea"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-crema shadow transition-all ${valor ? "left-[18px]" : "left-0.5"}`} />
      </span>
      {etiqueta}
    </button>
  );
}
