// Ilustraciones de categoría (se usan cuando un producto no tiene foto).
import type { Icono } from "@/lib/menu/tipos";

const TRAZOS: Record<Icono, React.ReactNode> = {
  plato: (
    <>
      <circle cx="12" cy="13" r="7" />
      <circle cx="12" cy="13" r="3.5" />
      <path d="M3 4v5a2 2 0 0 0 2 2M5 4v16M21 4c-1.5 1-2 3-2 5s1 2 2 2v9" />
    </>
  ),
  carne: (
    <>
      <path d="M4.5 13.5C3 10 5.5 5.5 10.5 4.8c4.6-.6 9 1.8 9.2 6 .2 4.6-4.3 8.4-9 8.4-3 0-5.2-2.1-6.2-5.7z" />
      <circle cx="14.5" cy="10.5" r="2.2" />
      <path d="M8 11c.5-1.8 1.8-3 3.5-3.5" />
    </>
  ),
  hamburguesa: (
    <>
      <path d="M4 10.5a8 5.5 0 0 1 16 0z" />
      <path d="M3 13.5h18" />
      <path d="M4.5 16.5h15v.5a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3z" />
      <path d="M9 7.5h.01M12 6.8h.01M15 7.5h.01" />
    </>
  ),
  alitas: (
    <path d="M14.5 3.5a5.6 5.6 0 0 1 4 8.6c-1.6 2.4-4.4 3-6.4 2.4L9 17.6a2 2 0 1 1-2.8-.9 2 2 0 1 1 .9-2.8l3.1-3.1c-.6-2 0-4.8 2.4-6.4a5 5 0 0 1 1.9-.9z" />
  ),
  postre: (
    <>
      <path d="M3 20h18" />
      <path d="M4.5 20v-7h15v7" />
      <path d="M4.5 16c2 1.4 3.8 1.4 5 0s3.6-1.4 5 0 3.8 1.4 5 0" />
      <path d="M12 13V9.5" />
      <path d="M12 7c.9 0 1.4-.9 1.1-1.7L12 3l-1.1 2.3C10.6 6.1 11.1 7 12 7z" />
    </>
  ),
  cerveza: (
    <>
      <path d="M5 8.5h10V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
      <path d="M15 11h2a2 2 0 0 1 2 2v2.5a2 2 0 0 1-2 2h-2" />
      <path d="M5 8.5a2.8 2.8 0 0 1 3-3.6 3 3 0 0 1 5.3.4A2.4 2.4 0 0 1 15 8.5" />
      <path d="M8.5 12v5.5M11.5 12v5.5" />
    </>
  ),
  fria: (
    <>
      <path d="M6 7.5h12l-1.4 12.6a1 1 0 0 1-1 .9H8.4a1 1 0 0 1-1-.9z" />
      <path d="M12.5 7.5 14.5 2.5l3 1" />
      <path d="M6.6 12h10.8" />
    </>
  ),
  caliente: (
    <>
      <path d="M4 9.5h13V14a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
      <path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M8.5 3.5c-1 1 1 2 0 3.2M12.5 3.5c-1 1 1 2 0 3.2" />
    </>
  ),
  tequila: (
    <>
      <path d="M6.5 7h11l-1.6 13a1 1 0 0 1-1 .9H9.1a1 1 0 0 1-1-.9z" />
      <path d="M7.3 13.5h9.4" />
      <path d="M14 7a3.5 3.5 0 0 1 6.5-1.8z" />
    </>
  ),
};

export function IconoCategoria({ icono, grosor = 1.7, className }: { icono: Icono; grosor?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={grosor} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {TRAZOS[icono]}
    </svg>
  );
}

type PropsSvg = { className?: string; size?: number };
const base = (size = 18) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
});

export const IconoBolsa = ({ size }: PropsSvg) => (
  <svg {...base(size)} strokeWidth={2}><path d="M6 7h12l-1 13H7L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>
);
export const IconoBuscar = ({ size }: PropsSvg) => (
  <svg {...base(size)} strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const IconoCerrar = ({ size }: PropsSvg) => (
  <svg {...base(size)} strokeWidth={2.4}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconoMas = ({ size }: PropsSvg) => (
  <svg {...base(size)} strokeWidth={2.8}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconoReloj = ({ size }: PropsSvg) => (
  <svg {...base(size)} strokeWidth={2.2}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 1.5" /></svg>
);
export const IconoBasura = ({ size }: PropsSvg) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
);
export const IconoUbicacion = ({ size }: PropsSvg) => (
  <svg {...base(size)} strokeWidth={2}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
);
export const IconoFlecha = ({ size }: PropsSvg) => (
  <svg {...base(size)} strokeWidth={2.4}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconoCheck = ({ size }: PropsSvg) => (
  <svg {...base(size)} strokeWidth={2.6}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const IconoInfo = ({ size }: PropsSvg) => (
  <svg {...base(size)} strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
);
