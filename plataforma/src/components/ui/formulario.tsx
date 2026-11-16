"use client";

import { useFormStatus } from "react-dom";
import type { InputHTMLAttributes, ReactNode } from "react";

export function Campo({
  etiqueta,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; error?: string[] }) {
  const id = props.id ?? props.name;
  const idError = error?.length ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-crema">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(idError)}
        aria-describedby={idError}
        className="h-12 rounded-xl border border-linea bg-superficie px-4 text-base text-crema outline-none transition placeholder:text-tenue focus:border-dorado/60 focus:bg-superficie-2 aria-invalid:border-red-400/70 read-only:opacity-70"
        {...props}
      />
      {idError && (
        <p id={idError} className="text-sm text-red-300">
          {error![0]}
        </p>
      )}
    </div>
  );
}

export function BotonEnviar({ children, pendiente }: { children: ReactNode; pendiente: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-guinda-2 to-guinda text-base font-bold text-crema shadow-[0_10px_30px_rgba(124,29,34,.45)] transition active:scale-[.98] disabled:cursor-wait disabled:opacity-70"
    >
      {pending && (
        <span className="size-4 animate-spin rounded-full border-2 border-crema/40 border-t-crema" aria-hidden />
      )}
      {pending ? pendiente : children}
    </button>
  );
}

export function Aviso({ tipo = "error", children }: { tipo?: "error" | "info"; children: ReactNode }) {
  return (
    <div
      role={tipo === "error" ? "alert" : "status"}
      className={
        tipo === "error"
          ? "rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          : "rounded-xl border border-dorado/30 bg-dorado/10 px-4 py-3 text-sm text-dorado-suave"
      }
    >
      {children}
    </div>
  );
}
