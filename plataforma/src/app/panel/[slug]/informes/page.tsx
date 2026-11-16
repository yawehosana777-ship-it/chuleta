import type { Metadata } from "next";
import Link from "next/link";
import { SinPermiso } from "@/components/panel/sin-permiso";
import { formatoDinero } from "@/lib/dinero";
import { contextoPagina, type ContextoPanel } from "@/server/panel/contexto";

export const metadata: Metadata = { title: "Informes" };

// Página privada: espera a confirmar sesión y permisos.
export const instant = false;

type Informe = {
  registrados: number; entregados: number; cancelados: number; en_curso: number;
  ventas_cents: number; descuentos_cents: number; cancelado_cents: number; cobrado_cents: number;
  por_tipo: Partial<Record<"dine_in" | "delivery", { pedidos: number; ventas_cents: number }>>;
  por_dia: { dia: string; registrados: number; entregados: number; cancelados: number; ventas_cents: number; cobrado_cents: number }[];
  mas_vendidos: { nombre: string; cantidad: number; ventas_cents: number }[];
};

const RANGOS = { hoy: "Hoy", ayer: "Ayer", "7d": "Últimos 7 días", mes: "Este mes", "30d": "Últimos 30 días" } as const;
type Rango = keyof typeof RANGOS;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Suma días a una fecha "AAAA-MM-DD" (sin horas, sin zonas). */
const sumarDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

export default async function PaginaInformes({ params, searchParams }: PageProps<"/panel/[slug]/informes">) {
  const { slug } = await params;
  const busqueda = await searchParams;
  const { ctx, autorizado } = await contextoPagina(slug, "reports.view");
  if (!autorizado) return <SinPermiso />;

  const { hoy, zona, moneda } = await datosBase(ctx);
  const rango: Rango | "personal" = typeof busqueda.desde === "string" ? "personal"
    : (Object.keys(RANGOS) as Rango[]).includes(busqueda.r as Rango) ? (busqueda.r as Rango) : "hoy";
  const [desde, hasta] =
    rango === "personal" && FECHA.test(String(busqueda.desde)) && FECHA.test(String(busqueda.hasta ?? busqueda.desde))
      ? [String(busqueda.desde), String(busqueda.hasta ?? busqueda.desde)]
      : rango === "ayer" ? [sumarDias(hoy, -1), sumarDias(hoy, -1)]
      : rango === "7d" ? [sumarDias(hoy, -6), hoy]
      : rango === "30d" ? [sumarDias(hoy, -29), hoy]
      : rango === "mes" ? [`${hoy.slice(0, 8)}01`, hoy]
      : [hoy, hoy];

  const { data, error } = await ctx.supabase.rpc("sales_report", { p_restaurant: ctx.restaurante.id, p_desde: desde, p_hasta: hasta });
  const inf = data as Informe | null;
  const Q = (c: number) => formatoDinero(c, moneda);
  const dia = (f: string) => new Intl.DateTimeFormat("es-GT", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${f}T12:00:00Z`));

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Periodo" className="flex flex-wrap gap-2">
        {(Object.entries(RANGOS) as [Rango, string][]).map(([clave, texto]) => (
          <Link key={clave} href={`/panel/${slug}/informes?r=${clave}`} aria-current={rango === clave ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${rango === clave ? "bg-guinda text-crema" : "border border-linea text-tenue"}`}>
            {texto}
          </Link>
        ))}
      </nav>
      <form className="flex flex-wrap items-end gap-2 text-sm" action={`/panel/${slug}/informes`}>
        <label className="flex flex-col gap-1">Desde<input type="date" name="desde" defaultValue={desde} className="h-10 rounded-lg border border-linea bg-superficie-2 px-2" /></label>
        <label className="flex flex-col gap-1">Hasta<input type="date" name="hasta" defaultValue={hasta} className="h-10 rounded-lg border border-linea bg-superficie-2 px-2" /></label>
        <button className="h-10 rounded-lg border border-linea bg-superficie-2 px-3 font-semibold">Ver</button>
      </form>

      {error || !inf ? (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          No se pudo armar el informe. Revisa las fechas (máximo un año) e inténtalo de nuevo.
        </p>
      ) : (
        <>
          <p className="text-sm text-tenue">{desde === hasta ? dia(desde) : `${dia(desde)} a ${dia(hasta)}`} · hora de {zona.replace("America/", "")}</p>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Resumen">
            <Tarjeta titulo="Ventas" valor={Q(inf.ventas_cents)} detalle={`${inf.entregados} pedidos entregados`} fuerte />
            <Tarjeta titulo="Cobrado en efectivo" valor={Q(inf.cobrado_cents)} detalle="Registrado en caja" fuerte />
            <Tarjeta titulo="Ticket promedio" valor={inf.entregados ? Q(Math.round(inf.ventas_cents / inf.entregados)) : "—"} detalle="Por pedido entregado" />
            <Tarjeta titulo="Descuentos dados" valor={Q(inf.descuentos_cents)} detalle="En pedidos entregados" />
            <Tarjeta titulo="Registrados" valor={String(inf.registrados)} detalle="Todos los pedidos que llegaron" />
            <Tarjeta titulo="Entregados" valor={String(inf.entregados)} />
            <Tarjeta titulo="Cancelados" valor={String(inf.cancelados)} detalle={inf.cancelados ? `${Q(inf.cancelado_cents)} que no se vendieron` : undefined} />
            <Tarjeta titulo="En curso" valor={String(inf.en_curso)} detalle="Aún sin entregar" />
          </section>
          <p className="-mt-3 text-xs text-tenue">
            «Ventas» son los pedidos entregados. «Cobrado» es el efectivo registrado: en mesas al cerrar la cuenta y en domicilio al marcar
            «Entregado y cobrado»; por eso pueden ser distintos si hay cuentas de mesa abiertas.
          </p>

          <section className="grid gap-3 sm:grid-cols-2">
            <Tarjeta titulo="En mesa" valor={Q(inf.por_tipo.dine_in?.ventas_cents ?? 0)} detalle={`${inf.por_tipo.dine_in?.pedidos ?? 0} pedidos entregados`} />
            <Tarjeta titulo="A domicilio" valor={Q(inf.por_tipo.delivery?.ventas_cents ?? 0)} detalle={`${inf.por_tipo.delivery?.pedidos ?? 0} pedidos entregados`} />
          </section>

          {inf.por_dia.length > 1 && (
            <section className="overflow-x-auto rounded-2xl border border-linea">
              <table className="w-full min-w-[480px] text-sm">
                <caption className="px-4 pt-3 text-left font-semibold">Por día</caption>
                <thead className="text-xs text-tenue">
                  <tr><th className="px-4 py-2 text-left font-semibold">Día</th><th className="px-2 text-right font-semibold">Registrados</th>
                    <th className="px-2 text-right font-semibold">Entregados</th><th className="px-2 text-right font-semibold">Cancelados</th>
                    <th className="px-2 text-right font-semibold">Ventas</th><th className="px-4 text-right font-semibold">Cobrado</th></tr>
                </thead>
                <tbody>
                  {inf.por_dia.map((d) => (
                    <tr key={d.dia} className="border-t border-linea">
                      <td className="px-4 py-2">{dia(d.dia)}</td><td className="px-2 text-right">{d.registrados}</td>
                      <td className="px-2 text-right">{d.entregados}</td><td className="px-2 text-right">{d.cancelados}</td>
                      <td className="px-2 text-right">{Q(d.ventas_cents)}</td><td className="px-4 text-right">{Q(d.cobrado_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="rounded-2xl border border-linea p-4">
            <h2 className="mb-2 font-semibold">Más vendidos</h2>
            {inf.mas_vendidos.length === 0 ? <p className="text-sm text-tenue">Sin pedidos entregados en este periodo.</p> : (
              <ol className="flex flex-col gap-1 text-sm">
                {inf.mas_vendidos.map((m, i) => (
                  <li key={m.nombre} className="flex justify-between gap-3">
                    <span><span className="text-tenue">{i + 1}.</span> {m.nombre} <span className="text-tenue">× {m.cantidad}</span></span>
                    <span>{Q(m.ventas_cents)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Tarjeta({ titulo, valor, detalle, fuerte = false }: { titulo: string; valor: string; detalle?: string; fuerte?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 ${fuerte ? "border-dorado/40 bg-dorado/10" : "border-linea bg-superficie"}`}>
      <p className="text-xs text-tenue">{titulo}</p>
      <p className="mt-1 text-xl font-bold">{valor}</p>
      {detalle && <p className="text-xs text-tenue">{detalle}</p>}
    </div>
  );
}

/** Fecha de hoy en la zona horaria del restaurante (según el servidor, no el aparato). */
async function datosBase(ctx: NonNullable<ContextoPanel>) {
  const { data: r } = await ctx.supabase.from("restaurants").select("timezone, currency").eq("id", ctx.restaurante.id).single();
  const zona = r?.timezone ?? "America/Guatemala";
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return { hoy, zona, moneda: r?.currency ?? "GTQ" };
}
