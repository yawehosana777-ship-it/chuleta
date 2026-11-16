import type { ReactNode } from "react";

/** Contenedor centrado para las pantallas de acceso (inicio de sesión, invitación). */
export function TarjetaAcceso({ titulo, subtitulo, children }: { titulo: string; subtitulo?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_50%_0%,#2a1615,transparent_60%)] px-4 py-10">
      <section className="w-full max-w-sm">
        <h1 className="font-titulo text-3xl leading-tight">{titulo}</h1>
        {subtitulo && <p className="mt-2 text-sm text-tenue">{subtitulo}</p>}
        <div className="mt-8">{children}</div>
      </section>
    </main>
  );
}
