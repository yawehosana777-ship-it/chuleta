"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { activarSonido, sonarAviso } from "@/lib/sonido";
import { clienteNavegador } from "@/lib/supabase/navegador";

type Nuevo = { numero: number; tipo: string };
type Conexion = "conectando" | "en_vivo" | "sin_conexion";

/** Evento que otras pantallas disparan para repetir el sonido (pedidos atrasados). */
export const RECORDAR = "pedidos:recordar";

/**
 * Escucha en tiempo real los pedidos del restaurante (Supabase Realtime).
 * Al llegar uno nuevo: suena, vibra, muestra un letrero y actualiza la pantalla.
 * Solo recibe lo que la base de datos le deja ver al usuario (RLS).
 */
export function AlertaPedidos({ slug, restauranteId }: { slug: string; restauranteId: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const rutaRef = useRef(ruta);
  const [nuevos, setNuevos] = useState<Nuevo[]>([]);
  const [sonido, setSonido] = useState(false);
  const [conexion, setConexion] = useState<Conexion>("conectando");

  useEffect(() => { rutaRef.current = ruta; }, [ruta]);

  // El navegador solo deja sonar después del primer toque en la página.
  useEffect(() => {
    const desbloquear = async () => setSonido(await activarSonido());
    window.addEventListener("pointerdown", desbloquear);
    window.addEventListener("keydown", desbloquear);
    return () => {
      window.removeEventListener("pointerdown", desbloquear);
      window.removeEventListener("keydown", desbloquear);
    };
  }, []);

  // Recordatorio de pedidos atrasados (lo pide la pantalla de pedidos).
  useEffect(() => {
    const recordar = () => sonarAviso(1);
    window.addEventListener(RECORDAR, recordar);
    return () => window.removeEventListener(RECORDAR, recordar);
  }, []);

  useEffect(() => {
    const supabase = clienteNavegador();
    let actualizar: ReturnType<typeof setTimeout> | undefined;
    // Varias notificaciones seguidas = una sola actualización de la pantalla.
    const refrescar = () => {
      clearTimeout(actualizar);
      actualizar = setTimeout(() => {
        if (/\/(pedidos|cocina|mesas)(\/|$)/.test(rutaRef.current)) router.refresh();
      }, 400);
    };

    const canal = supabase.channel(`pedidos:${restauranteId}`);
    let cancelado = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelado) return;
      canal
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restauranteId}` }, (cambio) => {
          if (cambio.eventType === "INSERT") {
            const fila = cambio.new as { number: number; type: string };
            setNuevos((n) => [...n, { numero: fila.number, tipo: fila.type }]);
            sonarAviso(2);
            navigator.vibrate?.([200, 100, 200]);
          }
          refrescar();
        })
        .subscribe((estado) => {
          setConexion(estado === "SUBSCRIBED" ? "en_vivo" : estado === "CHANNEL_ERROR" || estado === "TIMED_OUT" || estado === "CLOSED" ? "sin_conexion" : "conectando");
        });
    })();

    return () => {
      cancelado = true;
      clearTimeout(actualizar);
      supabase.removeChannel(canal);
    };
  }, [restauranteId, router]);

  // El título de la pestaña muestra cuántos pedidos nuevos hay sin ver
  // (y lo vuelve a poner si Next.js cambia el título al actualizar la página).
  useEffect(() => {
    const poner = () => {
      const base = document.title.replace(/^\(\d+\) /, "");
      const deseado = nuevos.length ? `(${nuevos.length}) ${base}` : base;
      if (document.title !== deseado) document.title = deseado;
    };
    poner();
    const vigia = new MutationObserver(poner);
    vigia.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => vigia.disconnect();
  }, [nuevos]);

  return (
    <>
      <div className="flex items-center gap-2 text-xs">
        <span className={`inline-flex items-center gap-1 ${conexion === "en_vivo" ? "text-emerald-300" : conexion === "sin_conexion" ? "text-red-300" : "text-tenue"}`}
          title={conexion === "sin_conexion" ? "Sin conexión en vivo: la lista se actualiza cada 30 segundos." : undefined}>
          <span className={`size-2 rounded-full ${conexion === "en_vivo" ? "bg-emerald-400" : conexion === "sin_conexion" ? "bg-red-400" : "bg-tenue"}`} aria-hidden />
          {conexion === "en_vivo" ? "En vivo" : conexion === "sin_conexion" ? "Sin conexión en vivo" : "Conectando…"}
        </span>
        <button type="button" onClick={async () => setSonido(await activarSonido())}
          className={`rounded-lg border px-2 py-1 ${sonido ? "border-linea text-tenue" : "border-dorado/60 bg-dorado/15 font-semibold text-crema"}`}>
          {sonido ? "🔔 Sonido activo" : "🔕 Toca para activar el sonido"}
        </button>
      </div>

      {nuevos.length > 0 && (
        <div role="alert" className="fixed inset-x-3 bottom-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-dorado/60 bg-guinda px-4 py-3 text-crema shadow-2xl">
          <p className="font-semibold">
            {nuevos.length === 1
              ? `Pedido nuevo #${nuevos[0].numero} · ${nuevos[0].tipo === "delivery" ? "A domicilio" : "En mesa"}`
              : `${nuevos.length} pedidos nuevos (#${nuevos.map((n) => n.numero).join(", #")})`}
          </p>
          <div className="flex shrink-0 gap-2">
            <Link href={`/panel/${slug}/pedidos`} onClick={() => setNuevos([])} className="rounded-xl bg-crema px-3 py-2 text-sm font-bold text-guinda">Ver</Link>
            <button type="button" onClick={() => setNuevos([])} aria-label="Cerrar aviso" className="rounded-xl px-2 text-lg">×</button>
          </div>
        </div>
      )}
    </>
  );
}
