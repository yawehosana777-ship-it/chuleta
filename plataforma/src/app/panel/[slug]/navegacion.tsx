"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navegacion({ slug, secciones }: { slug: string; secciones: { ruta: string; nombre: string }[] }) {
  const ruta = usePathname();
  return (
    // Los botones bajan a otra línea si no caben: todas las secciones se ven siempre, sin deslizar hacia el lado.
    <nav aria-label="Secciones del panel">
      <ul className="flex flex-wrap gap-2">
        {secciones.map((s) => {
          const href = `/panel/${slug}/${s.ruta}`;
          const activa = ruta === href || ruta.startsWith(`${href}/`);
          return (
            <li key={s.ruta}>
              <Link href={href} aria-current={activa ? "page" : undefined}
                className={`flex h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition ${
                  activa ? "bg-guinda text-crema" : "border border-linea bg-superficie text-tenue hover:text-crema"
                }`}>
                {s.nombre}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
