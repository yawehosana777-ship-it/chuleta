import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Actualizar } from "@/components/actualizar";
import { formatoDinero } from "@/lib/dinero";
import { ESTADO_CLIENTE, NOMBRE_ESTADO, PASOS_CLIENTE, terminado, type EstadoPedido } from "@/lib/pedidos";
import { clientePublico } from "@/lib/supabase/publico";

export const metadata: Metadata = { title: "Tu pedido", robots: { index: false } };

// Siempre al momento: el estado del pedido cambia.
export const instant = false;

type Seguimiento = {
  number: number; status: EstadoPedido; total_cents: number; created_at: string; notes: string | null;
  restaurant: string; slug: string; currency: string; table: string | null;
  items: { name: string; quantity: number; options: { name: string }[]; notes: string | null; line_total_cents: number }[];
  account: { open: boolean; total_cents: number; orders: { number: number; status: EstadoPedido; total_cents: number }[] } | null;
};

export default async function PaginaSeguimiento({ params, searchParams }: PageProps<"/pedido/[token]">) {
  await connection();
  const { token } = await params;
  const { m } = await searchParams;
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();

  const { data } = await clientePublico().rpc("order_by_token", { p_token: token });
  const p = data as Seguimiento | null;
  if (!p) notFound();

  const Q = (c: number) => formatoDinero(c, p.currency);
  const paso = PASOS_CLIENTE.indexOf(p.status);
  const volver = typeof m === "string" && /^[0-9a-f]{24}$/.test(m) ? `/r/${p.slug}/mesa/${m}` : `/r/${p.slug}`;
  const cuentaPendiente = p.account?.orders.some((o) => !terminado(o.status)) ?? false;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-8">
      {(!terminado(p.status) || cuentaPendiente) && <Actualizar segundos={15} />}

      <header className="text-center">
        <p className="text-sm text-tenue">{p.restaurant}{p.table && ` · ${p.table}`}</p>
        <h1 className="mt-1 font-titulo text-3xl">Pedido #{p.number}</h1>
        <p role="status" aria-live="polite"
          className={`mt-3 rounded-xl px-4 py-3 text-sm font-semibold ${
            p.status === "cancelado" ? "border border-red-400/30 bg-red-500/10 text-red-200"
              : p.status === "listo" || p.status === "entregado" ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
              : "border border-dorado/30 bg-dorado/10 text-crema"
          }`}>
          {ESTADO_CLIENTE[p.status]}
        </p>
      </header>

      {p.status !== "cancelado" && (
        <ol className="grid grid-cols-5 gap-1 text-center text-[11px]" aria-label="Avance del pedido">
          {PASOS_CLIENTE.map((e, i) => (
            <li key={e} className={i <= paso ? "text-crema" : "text-tenue"}>
              <span className={`mx-auto mb-1 block h-1.5 rounded-full ${i <= paso ? "bg-dorado" : "bg-superficie-2"}`} />
              {NOMBRE_ESTADO[e]}
              {i === paso && <span className="sr-only"> (estado actual)</span>}
            </li>
          ))}
        </ol>
      )}

      <section className="rounded-2xl border border-linea bg-superficie p-4">
        <h2 className="mb-2 font-semibold">Lo que pediste</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {p.items.map((i, n) => (
            <li key={n} className="flex justify-between gap-3">
              <span>
                {i.quantity} × {i.name}
                {i.options.length > 0 && <span className="text-tenue"> ({i.options.map((o) => o.name).join(", ")})</span>}
                {i.notes && <span className="block text-xs italic text-tenue">“{i.notes}”</span>}
              </span>
              <span className="whitespace-nowrap">{Q(i.line_total_cents)}</span>
            </li>
          ))}
        </ul>
        {p.notes && <p className="mt-3 text-xs text-tenue">Notas: {p.notes}</p>}
        <p className="mt-3 flex justify-between border-t border-linea pt-3 font-semibold">
          <span>Total de este pedido</span><span>{Q(p.total_cents)}</span>
        </p>
      </section>

      {p.account && p.account.orders.length > 1 && (
        <section className="rounded-2xl border border-linea bg-superficie p-4">
          <h2 className="mb-2 font-semibold">Cuenta de {p.table ?? "la mesa"}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {p.account.orders.map((o) => (
              <li key={o.number} className={`flex justify-between gap-3 ${o.status === "cancelado" ? "text-tenue line-through" : ""}`}>
                <span>Pedido #{o.number} · {NOMBRE_ESTADO[o.status]}</span>
                <span>{Q(o.total_cents)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between border-t border-linea pt-3 font-semibold">
            <span>Total de la mesa</span><span>{Q(p.account.total_cents)}</span>
          </p>
        </section>
      )}

      <p className="text-center text-xs text-tenue">
        {p.account?.open === false
          ? "La cuenta de esta mesa ya se cerró. ¡Gracias por tu visita!"
          : "Pagas en efectivo con tu mesero al terminar. Guarda esta página para ver cómo va tu pedido."}
      </p>

      {p.account?.open !== false && (
        <Link href={volver} className="flex h-12 items-center justify-center rounded-xl border border-linea bg-superficie-2 font-semibold">
          Pedir algo más
        </Link>
      )}
    </main>
  );
}
