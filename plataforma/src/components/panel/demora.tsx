"use client";

import { useEffect, useState } from "react";
import { RECORDAR } from "./alerta-pedidos";

/**
 * Minutos transcurridos según la hora del SERVIDOR (no la de este aparato,
 * que puede estar mal). Se recalcula cada 20 segundos.
 */
function useMinutosDesde(desdeIso: string, ahoraServidor: number) {
  const [minutos, setMinutos] = useState<number | null>(null);
  useEffect(() => {
    const desfase = ahoraServidor - Date.now();
    const calcular = () => setMinutos(Math.max(0, Math.floor((Date.now() + desfase - Date.parse(desdeIso)) / 60000)));
    const primero = setTimeout(calcular, 0);
    const t = setInterval(calcular, 20000);
    return () => { clearTimeout(primero); clearInterval(t); };
  }, [desdeIso, ahoraServidor]);
  return minutos;
}

/** "Hace 7 min" y, si pasó el límite, "Atrasado" en rojo. */
export function Demora({ creado, ahoraServidor, limite, grande = false }: { creado: string; ahoraServidor: number; limite: number | null; grande?: boolean }) {
  const minutos = useMinutosDesde(creado, ahoraServidor);
  if (minutos === null) return null;
  const atrasado = limite !== null && minutos >= limite;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${grande ? "text-base" : "text-xs"} ${
      atrasado ? "bg-red-500/20 text-red-200 ring-1 ring-red-400/60" : "text-tenue"}`}>
      {minutos < 1 ? "Ahora" : `Hace ${minutos} min`}
      {atrasado && " · Atrasado"}
    </span>
  );
}

/** Si hay pedidos nuevos sin aceptar más allá del límite, repite el sonido cada minuto. */
export function RecordarAtrasados({ nuevos, limite, ahoraServidor }: { nuevos: string[]; limite: number; ahoraServidor: number }) {
  useEffect(() => {
    if (!nuevos.length) return;
    const desfase = ahoraServidor - Date.now();
    const t = setInterval(() => {
      const ahora = Date.now() + desfase;
      if (nuevos.some((c) => ahora - Date.parse(c) >= limite * 60000)) window.dispatchEvent(new Event(RECORDAR));
    }, 60000);
    return () => clearInterval(t);
  }, [nuevos, limite, ahoraServidor]);
  return null;
}
