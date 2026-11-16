import type { Metadata } from "next";
import QRCode from "qrcode";
import { Actualizar } from "@/components/actualizar";
import { BotonAccion } from "@/components/panel/controles";
import { SinPermiso } from "@/components/panel/sin-permiso";
import { formatoDinero } from "@/lib/dinero";
import { envPublico } from "@/lib/env";
import { NOMBRE_ESTADO, terminado, type EstadoPedido } from "@/lib/pedidos";
import { contextoPagina } from "@/server/panel/contexto";
import { cambiarMesaActiva, cerrarCuenta } from "./acciones";
import { FormularioMesa } from "./formulario";

export const metadata: Metadata = { title: "Mesas" };

// Página privada: espera a confirmar sesión y permisos.
export const instant = false;

type Mesa = { id: string; label: string; qr_code: string; active: boolean };
type Cuenta = { id: string; table_id: string; orders: { number: number; status: EstadoPedido; total_cents: number }[] };

export default async function PaginaMesas({ params }: PageProps<"/panel/[slug]/mesas">) {
  const { slug } = await params;
  const { ctx, autorizado } = await contextoPagina(slug, "tables.manage");
  if (!autorizado) return <SinPermiso />;

  const [{ data: mesas }, { data: cuentas }, { data: r }] = await Promise.all([
    ctx.supabase.from("tables").select("id, label, qr_code, active").eq("restaurant_id", ctx.restaurante.id).returns<Mesa[]>(),
    ctx.supabase.from("table_accounts").select("id, table_id, orders(number, status, total_cents)")
      .eq("restaurant_id", ctx.restaurante.id).eq("status", "open").returns<Cuenta[]>(),
    ctx.supabase.from("restaurants").select("currency").eq("id", ctx.restaurante.id).single(),
  ]);

  // Orden natural: Mesa 2 antes que Mesa 10.
  const lista = (mesas ?? []).sort((a, b) => a.label.localeCompare(b.label, "es", { numeric: true }));
  const base = envPublico().NEXT_PUBLIC_SITE_URL;
  const qrs = await Promise.all(lista.map((m) => QRCode.toString(`${base}/r/${slug}/mesa/${m.qr_code}`, { type: "svg", margin: 1 })));
  const Q = (c: number) => formatoDinero(c, r?.currency ?? "GTQ");
  const numeros = lista.map((m) => Number(/^Mesa (\d+)$/.exec(m.label)?.[1] ?? 0));
  const sugerencia = `Mesa ${Math.max(0, ...numeros) + 1}`;

  return (
    <div className="flex flex-col gap-8">
      {/* Respaldo por si se corta la conexión en vivo. */}
      <Actualizar segundos={30} />
      {base.includes("localhost") && (
        <p className="rounded-2xl border border-dorado/30 bg-dorado/5 px-4 py-3 text-sm text-tenue">
          Estos códigos apuntan a <b className="text-crema">{base}</b>, que solo abre en esta computadora. Funcionarán en los teléfonos
          de los clientes cuando la página esté publicada con su dominio (Fase 8). No los imprimas todavía.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Mesas <span className="text-tenue">({lista.length})</span></h2>
        {lista.length === 0 && <p className="rounded-2xl border border-dashed border-linea px-4 py-6 text-center text-sm text-tenue">Aún no hay mesas. Crea la primera abajo.</p>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {lista.map((m, i) => {
            const cuenta = cuentas?.find((c) => c.table_id === m.id);
            const vigentes = cuenta?.orders.filter((o) => o.status !== "cancelado") ?? [];
            const total = vigentes.reduce((s, o) => s + o.total_cents, 0);
            const pendientes = cuenta?.orders.filter((o) => !terminado(o.status)).length ?? 0;
            const url = `${base}/r/${slug}/mesa/${m.qr_code}`;
            return (
              <li key={m.id} className={`flex flex-col gap-3 rounded-2xl border border-linea bg-superficie p-4 ${m.active ? "" : "opacity-60"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-lg font-bold">{m.label}</p>
                  <BotonAccion accion={cambiarMesaActiva.bind(null, slug, m.id, !m.active)} peligro={m.active}
                    confirmar={m.active ? `¿Desactivar ${m.label}? Su código QR dejará de servir para pedir.` : undefined}>
                    {m.active ? "Desactivar" : "Activar"}
                  </BotonAccion>
                </div>

                {m.active && (
                  <div className="flex items-center gap-3">
                    {/* SVG generado aquí mismo por la librería qrcode a partir de nuestra propia dirección. */}
                    <div className="w-28 shrink-0 rounded-lg bg-white p-1" role="img" aria-label={`Código QR de ${m.label}`}
                      dangerouslySetInnerHTML={{ __html: qrs[i] }} />
                    <div className="flex min-w-0 flex-col gap-2 text-xs">
                      <a href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrs[i])}`} download={`qr-${m.label.replace(/\s+/g, "-").toLowerCase()}.svg`}
                        className="rounded-lg border border-linea bg-superficie-2 px-3 py-2 text-center font-semibold">Descargar QR</a>
                      <a href={url} target="_blank" rel="noopener" className="truncate text-tenue underline">Probar el enlace ↗</a>
                    </div>
                  </div>
                )}

                {cuenta ? (
                  <div className="rounded-xl border border-dorado/30 bg-dorado/5 p-3 text-sm">
                    <p className="font-semibold">Cuenta abierta · {Q(total)}</p>
                    <ul className="mt-1 text-xs text-tenue">
                      {cuenta.orders.sort((a, b) => a.number - b.number).map((o) => (
                        <li key={o.number} className={o.status === "cancelado" ? "line-through" : ""}>#{o.number} · {NOMBRE_ESTADO[o.status]} · {Q(o.total_cents)}</li>
                      ))}
                    </ul>
                    <div className="mt-3">
                      {pendientes > 0 ? (
                        <p className="text-xs text-tenue">Para cerrar la cuenta, primero entrega o cancela {pendientes === 1 ? "el pedido pendiente" : `los ${pendientes} pedidos pendientes`}.</p>
                      ) : (
                        <BotonAccion accion={cerrarCuenta.bind(null, slug, cuenta.id, total)} className="w-full border-dorado/60 bg-dorado/20"
                          confirmar={`¿Recibiste ${Q(total)} en efectivo de ${m.label}? La cuenta se cerrará.`}>
                          Cobrado en efectivo · Cerrar cuenta
                        </BotonAccion>
                      )}
                    </div>
                  </div>
                ) : (
                  m.active && <p className="text-xs text-tenue">Sin cuenta abierta.</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl border border-linea bg-superficie p-4">
        <h2 className="mb-4 font-semibold">Nueva mesa</h2>
        <FormularioMesa slug={slug} sugerencia={sugerencia} />
      </section>
    </div>
  );
}
