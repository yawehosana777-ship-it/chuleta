"use client";

import { useEffect } from "react";

export default function ErrorGeneral({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-titulo text-2xl">Algo salió mal</h1>
      <p className="max-w-sm text-sm text-tenue">
        No pudimos completar la operación. Inténtalo de nuevo; si el problema sigue, avísanos.
        {error.digest && <span className="mt-2 block text-xs">Código: {error.digest}</span>}
      </p>
      <button onClick={reset} className="h-11 rounded-xl bg-guinda px-5 text-sm font-bold">
        Reintentar
      </button>
    </main>
  );
}
