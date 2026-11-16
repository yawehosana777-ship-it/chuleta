import type { Metadata } from "next";
import Link from "next/link";
import { Actualizar } from "@/components/actualizar";
import { BotonAccion, Interruptor } from "@/components/panel/controles";
import { SinPermiso } from "@/components/panel/sin-permiso";
import { formatoDinero } from "@/lib/dinero";
import { NOMBRE_ESTADO, puedeCancelar, siguientesPasos, terminado, type EstadoPedido } from "@/lib/pedidos";
import { contextoPagina, type ContextoPanel } from "@/server/panel/contexto";
import { cambiarEstado, pausarPedidos } from "./acciones";
import { FormularioCancelar } from "./cancelar";

export const metadata: Metadata = { title: "Pedidos" };

// Página privada: espera a confirmar sesión y permisos.
export const instant = false;

type Pedido = {
  id: string; number: number; type: "dine_in" | "delivery"; status: EstadoPedido; version: number; created_at: string;
  customer_name: string | null; customer_phone: string | null; delivery_address: string | null; delivery_references: string | null;
  notes: string | null; delivery_fee_cents: number; total_cents: number;
  table_accounts: { tables: { label: string } | null } | null;
  order_items: { product_name: string; quantity: number; options: { name: string }[]; notes: string | null; line_total_cents: number }[];
};

const ORDEN: Record<EstadoPedido, number> = { nuevo: 0, aceptado: 1, en_preparacion: 2, listo: 3, entregado: 4, cancelado: 5 };
const COLOR: Record<EstadoPedido, string> = {
  nuevo: "border-dorado/60 bg-dorado/10", aceptado: "border-linea bg-superficie", en_preparacion: "border-linea bg-superficie",
  listo: "border-emerald-400/40 bg-emerald-500/5", entregado: "border-linea bg-superficie opacity-70", cancelado: "border-linea bg-superficie opacity-60",
};

export default async function PaginaPedidos({ params }: PageProps<"/panel/[slug]/pedidos">) {
  const { slug } = await params;
  const { ctx, autorizado } = await contextoPagina(slug, "orders.view");
  if (!autorizado) return <SinPermiso />;

  const [{ data: pedidos }, { data: r }, { count: dias }] = await leerDatos(ctx);

  const Q = (c: number) => formatoDinero(c, r?.currency ?? "GTQ");
  const hora = new Intl.DateTimeFormat("es-GT", { timeStyle: "short", timeZone: r?.timezone ?? "America/Guatemala" });
  const activos = (pedidos ?? []).filter((p) => !terminado(p.status)).sort((a, b) => ORDEN[a.status] - ORDEN[b.status]);
  const terminados = (pedidos ?? []).filter((p) => terminado(p.status)).reverse();

  return (
    <div className="flex flex-col gap-6">
      <Actualizar segundos={10} />

      <section className="flex flex-col gap-2">
        {ctx.puede("settings.edit") && r && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-linea bg-superficie px-4 py-2">
            <p className="text-sm">{r.orders_paused ? "Pedidos en pausa: los clientes no pueden pedir desde el teléfono." : "Recibiendo pedidos."}</p>
            <Interruptor key={String(r.orders_paused)} etiqueta="Pausar" activo={r.orders_paused} accion={pausarPedidos.bind(null, slug)} colorActivo="bg-red-500" />
          </div>
        )}
        {r && !r.dine_in_enabled && <Aviso>Los pedidos en mesa están apagados. Actívalos en <Link className="underline" href={`/panel/${slug}/restaurante`}>Restaurante</Link>.</Aviso>}
        {!dias && <Aviso>Aún no hay horario: los clientes no pueden pedir hasta que lo configures en <Link className="underline" href={`/panel/${slug}/restaurante`}>Restaurante</Link>.</Aviso>}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="t-activos">
        <h2 id="t-activos" className="font-semibold">Pedidos activos <span className="text-tenue">({activos.length})</span></h2>
        {activos.length === 0 && <p className="rounded-2xl border border-dashed border-linea px-4 py-6 text-center text-sm text-tenue">No hay pedidos por atender. Esta pantalla se actualiza sola.</p>}
        <ul className="flex flex-col gap-3">
          {activos.map((p) => (
            <li key={p.id} className={`rounded-2xl border p-4 ${COLOR[p.status]}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-lg font-bold">
                  #{p.number} · {lugar(p)}
                  {p.customer_name && <span className="text-sm font-normal text-tenue"> · {p.customer_name}</span>}
                </p>
                <p className="text-sm text-tenue">{hora.format(new Date(p.created_at))} · <b className="text-crema">{nombreEstado(p)}</b></p>
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {p.order_items.map((i, n) => (
                  <li key={n}>
                    <b>{i.quantity} ×</b> {i.product_name}
                    {i.options.length > 0 && <span className="text-tenue"> ({i.options.map((o) => o.name).join(", ")})</span>}
                    {i.notes && <span className="block pl-5 text-xs italic text-dorado">“{i.notes}”</span>}
                  </li>
                ))}
              </ul>
              {p.type === "delivery" && (
                <div className="mt-2 rounded-lg border border-linea bg-superficie-2 px-3 py-2 text-sm">
                  <p>{p.delivery_address}</p>
                  {p.delivery_references && <p className="text-xs text-tenue">{p.delivery_references}</p>}
                  {p.customer_phone && (
                    <a href={`tel:${p.customer_phone.replace(/\D/g, "")}`} className="mt-1 inline-block font-semibold text-dorado underline">
                      Llamar · {p.customer_phone}
                    </a>
                  )}
                </div>
              )}
              {p.notes && <p className="mt-2 rounded-lg bg-superficie-2 px-3 py-2 text-xs">Notas: {p.notes}</p>}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {Q(p.total_cents)}
                  {p.type === "delivery" && <span className="text-xs font-normal text-tenue"> · envío {p.delivery_fee_cents ? Q(p.delivery_fee_cents) : "gratis"} · cobrar en efectivo</span>}
                </span>
                <div className="flex flex-wrap gap-2">
                  {siguientesPasos(p.status, ctx.puede).map((s) => (
                    <BotonAccion key={s.a} accion={cambiarEstado.bind(null, slug, p.id, s.a, p.version)}
                      className={s.a === "aceptado" ? "border-dorado/60 bg-dorado/20" : ""}>
                      {p.type === "delivery" && s.a === "listo" ? "En camino" : p.type === "delivery" && s.a === "entregado" ? "Entregado y cobrado" : s.etiqueta}
                    </BotonAccion>
                  ))}
                </div>
              </div>
              {puedeCancelar(p.status, ctx.puede) && (
                <details className="mt-3 rounded-xl border border-linea p-3">
                  <summary className="cursor-pointer text-sm text-tenue">Cancelar pedido</summary>
                  <div className="mt-3"><FormularioCancelar slug={slug} pedidoId={p.id} version={p.version} /></div>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>

      {terminados.length > 0 && (
        <details className="rounded-2xl border border-linea p-4">
          <summary className="cursor-pointer font-semibold">Terminados en las últimas 12 horas ({terminados.length})</summary>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {terminados.map((p) => (
              <li key={p.id} className="flex justify-between gap-3">
                <span>#{p.number} · {lugar(p)} · {hora.format(new Date(p.created_at))}</span>
                <span className={p.status === "cancelado" ? "text-red-300" : "text-tenue"}>{NOMBRE_ESTADO[p.status]} · {Q(p.total_cents)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Pedidos activos + los terminados de las últimas 12 horas, estado del restaurante y si tiene horario. */
function leerDatos(ctx: NonNullable<ContextoPanel>) {
  const desde = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  return Promise.all([
    ctx.supabase.from("orders")
      .select("id, number, type, status, version, created_at, customer_name, customer_phone, delivery_address, delivery_references, notes, delivery_fee_cents, total_cents, table_accounts(tables(label)), order_items(product_name, quantity, options, notes, line_total_cents)")
      .eq("restaurant_id", ctx.restaurante.id)
      .or(`status.in.(nuevo,aceptado,en_preparacion,listo),created_at.gte.${desde}`)
      .order("created_at", { ascending: true }).limit(150).returns<Pedido[]>(),
    ctx.supabase.from("restaurants").select("orders_paused, dine_in_enabled, currency, timezone").eq("id", ctx.restaurante.id).single(),
    ctx.supabase.from("opening_hours").select("id", { count: "exact", head: true }).eq("restaurant_id", ctx.restaurante.id).eq("service", "dine_in"),
  ]);
}

const nombreEstado = (p: Pedido) => (p.type === "delivery" && p.status === "listo" ? "En camino" : NOMBRE_ESTADO[p.status]);
const lugar = (p: Pedido) => (p.type === "delivery" ? "A domicilio" : p.table_accounts?.tables?.label ?? "Sin mesa");

function Aviso({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dorado/40 bg-dorado/10 px-4 py-3 text-sm">{children}</p>;
}
