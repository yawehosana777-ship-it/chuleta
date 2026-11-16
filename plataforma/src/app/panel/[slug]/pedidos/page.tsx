import type { Metadata } from "next";
import Link from "next/link";
import { Actualizar } from "@/components/actualizar";
import { BotonAccion, Interruptor } from "@/components/panel/controles";
import { Demora, RecordarAtrasados } from "@/components/panel/demora";
import { SinPermiso } from "@/components/panel/sin-permiso";
import { formatoDinero } from "@/lib/dinero";
import { limiteAtraso, NOMBRE_ESTADO, puedeCancelar, siguientesPasos, terminado, type EstadoPedido } from "@/lib/pedidos";
import { contextoPagina, type ContextoPanel } from "@/server/panel/contexto";
import { cambiarEstado, pausarPedidos, tomarPedido } from "./acciones";
import { FormularioCancelar } from "./cancelar";

export const metadata: Metadata = { title: "Pedidos" };

// Página privada: espera a confirmar sesión y permisos.
export const instant = false;

type Pedido = {
  id: string; number: number; type: "dine_in" | "delivery"; status: EstadoPedido; version: number; created_at: string;
  customer_name: string | null; customer_phone: string | null; delivery_address: string | null; delivery_references: string | null;
  notes: string | null; delivery_fee_cents: number; total_cents: number; assigned_to: string | null;
  table_accounts: { tables: { label: string } | null } | null;
  order_items: { product_name: string; quantity: number; options: { name: string }[]; notes: string | null; promotion: string | null; line_total_cents: number }[];
};

const ORDEN: Record<EstadoPedido, number> = { nuevo: 0, aceptado: 1, en_preparacion: 2, listo: 3, entregado: 4, cancelado: 5 };
const COLOR: Record<EstadoPedido, string> = {
  nuevo: "border-dorado/60 bg-dorado/10", aceptado: "border-linea bg-superficie", en_preparacion: "border-linea bg-superficie",
  listo: "border-emerald-400/40 bg-emerald-500/5", entregado: "border-linea bg-superficie opacity-70", cancelado: "border-linea bg-superficie opacity-60",
};
const FILTROS = { todos: "Todos", mios: "Míos", libres: "Sin encargado" } as const;

export default async function PaginaPedidos({ params, searchParams }: PageProps<"/panel/[slug]/pedidos">) {
  const { slug } = await params;
  const { ver } = await searchParams;
  const { ctx, autorizado } = await contextoPagina(slug, "orders.view");
  if (!autorizado) return <SinPermiso />;

  const { ahora, datos: [{ data: pedidos }, { data: r }, { count: dias }, { data: equipo }] } = await leerDatos(ctx);
  const filtro: keyof typeof FILTROS = ver === "mios" || ver === "libres" ? ver : "todos";
  const atiende = ctx.puede("orders.accept") || ctx.puede("orders.update");
  const jefe = ctx.rol === "owner" || ctx.rol === "manager";
  const nombre = (id: string) => (id === ctx.usuarioId ? "Tú" : equipo?.find((e: { user_id: string }) => e.user_id === id)?.full_name ?? "Otra persona");

  const Q = (c: number) => formatoDinero(c, r?.currency ?? "GTQ");
  const hora = new Intl.DateTimeFormat("es-GT", { timeStyle: "short", timeZone: r?.timezone ?? "America/Guatemala" });
  const limites = { aceptar: r?.alert_accept_minutes ?? 5, preparar: r?.alert_ready_minutes ?? 25 };
  const activos = (pedidos ?? []).filter((p) => !terminado(p.status))
    .filter((p) => filtro === "todos" || (filtro === "mios" ? p.assigned_to === ctx.usuarioId : !p.assigned_to))
    .sort((a, b) => ORDEN[a.status] - ORDEN[b.status]);
  const terminados = (pedidos ?? []).filter((p) => terminado(p.status)).reverse();
  const nuevos = (pedidos ?? []).filter((p) => p.status === "nuevo").map((p) => p.created_at);

  return (
    <div className="flex flex-col gap-6">
      {/* Respaldo por si se corta la conexión en vivo. */}
      <Actualizar segundos={30} />
      <RecordarAtrasados nuevos={nuevos} limite={limites.aceptar} ahoraServidor={ahora} />

      <section className="flex flex-col gap-2">
        {ctx.puede("settings.edit") && r && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-linea bg-superficie px-4 py-2">
            <p className="text-sm">{r.orders_paused ? "Pedidos en pausa: los clientes no pueden pedir desde el teléfono." : "Recibiendo pedidos."}</p>
            <Interruptor key={String(r.orders_paused)} etiqueta="Pausar" activo={r.orders_paused} accion={pausarPedidos.bind(null, slug)} colorActivo="bg-red-500" />
          </div>
        )}
        {r && !r.dine_in_enabled && !r.delivery_enabled && <Aviso>Los pedidos en mesa y a domicilio están apagados. Actívalos en <Link className="underline" href={`/panel/${slug}/restaurante`}>Restaurante</Link>.</Aviso>}
        {!dias && <Aviso>Aún no hay horario: los clientes no pueden pedir hasta que lo configures en <Link className="underline" href={`/panel/${slug}/restaurante`}>Restaurante</Link>.</Aviso>}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="t-activos">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="t-activos" className="font-semibold">Pedidos activos <span className="text-tenue">({activos.length})</span></h2>
          <nav aria-label="Filtrar pedidos" className="flex gap-1 text-xs">
            {Object.entries(FILTROS).map(([clave, texto]) => (
              <Link key={clave} href={clave === "todos" ? `/panel/${slug}/pedidos` : `/panel/${slug}/pedidos?ver=${clave}`}
                aria-current={filtro === clave ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 font-semibold ${filtro === clave ? "bg-guinda text-crema" : "border border-linea text-tenue"}`}>
                {texto}
              </Link>
            ))}
          </nav>
        </div>
        {activos.length === 0 && <p className="rounded-2xl border border-dashed border-linea px-4 py-6 text-center text-sm text-tenue">No hay pedidos por atender. Cuando llegue uno, sonará el aviso.</p>}
        <ul className="flex flex-col gap-3">
          {activos.map((p) => (
            <li key={p.id} className={`rounded-2xl border p-4 ${COLOR[p.status]}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-lg font-bold">
                  #{p.number} · {lugar(p)}
                  {p.customer_name && <span className="text-sm font-normal text-tenue"> · {p.customer_name}</span>}
                </p>
                <p className="flex flex-wrap items-center gap-2 text-sm text-tenue">
                  {hora.format(new Date(p.created_at))}
                  <Demora creado={p.created_at} ahoraServidor={ahora} limite={limiteAtraso(p.status, limites)} />
                  <b className="text-crema">{nombreEstado(p)}</b>
                </p>
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {p.order_items.map((i, n) => (
                  <li key={n}>
                    <b>{i.quantity} ×</b> {i.product_name}
                    {i.options.length > 0 && <span className="text-tenue"> ({i.options.map((o) => o.name).join(", ")})</span>}
                    {i.notes && <span className="block pl-5 text-xs italic text-dorado">“{i.notes}”</span>}
                    {i.promotion && <span className="block pl-5 text-xs text-emerald-300">Promo: {i.promotion}</span>}
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

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-tenue">{p.assigned_to ? <>Atiende: <b className="text-crema">{nombre(p.assigned_to)}</b></> : "Sin encargado"}</span>
                {atiende && !p.assigned_to && (
                  <BotonAccion accion={tomarPedido.bind(null, slug, p.id, true)}>Me encargo</BotonAccion>
                )}
                {p.assigned_to && (p.assigned_to === ctx.usuarioId || jefe) && (
                  <BotonAccion accion={tomarPedido.bind(null, slug, p.id, false)}>Soltar</BotonAccion>
                )}
              </div>

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

/** Pedidos activos + terminados de las últimas 12 horas, estado del restaurante, horario y nombres del equipo. */
async function leerDatos(ctx: NonNullable<ContextoPanel>) {
  const ahora = Date.now();
  const desde = new Date(ahora - 12 * 60 * 60 * 1000).toISOString();
  const datos = await Promise.all([
    ctx.supabase.from("orders")
      .select("id, number, type, status, version, created_at, customer_name, customer_phone, delivery_address, delivery_references, notes, delivery_fee_cents, total_cents, assigned_to, table_accounts(tables(label)), order_items(product_name, quantity, options, notes, promotion, line_total_cents)")
      .eq("restaurant_id", ctx.restaurante.id)
      .or(`status.in.(nuevo,aceptado,en_preparacion,listo),created_at.gte.${desde}`)
      .order("created_at", { ascending: true }).limit(150).returns<Pedido[]>(),
    ctx.supabase.from("restaurants")
      .select("orders_paused, dine_in_enabled, delivery_enabled, currency, timezone, alert_accept_minutes, alert_ready_minutes")
      .eq("id", ctx.restaurante.id).single(),
    ctx.supabase.from("opening_hours").select("id", { count: "exact", head: true }).eq("restaurant_id", ctx.restaurante.id).eq("service", "dine_in"),
    ctx.supabase.rpc("team_names", { p_restaurant: ctx.restaurante.id }),
  ]);
  return { ahora, datos };
}

const nombreEstado = (p: Pedido) => (p.type === "delivery" && p.status === "listo" ? "En camino" : NOMBRE_ESTADO[p.status]);
const lugar = (p: Pedido) => (p.type === "delivery" ? "A domicilio" : p.table_accounts?.tables?.label ?? "Sin mesa");

function Aviso({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dorado/40 bg-dorado/10 px-4 py-3 text-sm">{children}</p>;
}
