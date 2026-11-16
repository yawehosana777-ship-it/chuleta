/** Indicador de carga accesible para pantallas completas. */
export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div role="status" className="flex flex-1 items-center justify-center gap-3 py-24 text-sm text-tenue">
      <span className="size-5 animate-spin rounded-full border-2 border-linea border-t-dorado" aria-hidden />
      {texto}
    </div>
  );
}
