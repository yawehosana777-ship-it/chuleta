"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { enviarPedido } from "@/app/r/[slug]/mesa/[codigo]/acciones";
import { formatoDinero } from "@/lib/dinero";
import {
  agregarLinea, alternarOpcion, cambiarCantidad, CANTIDAD_MAXIMA, crearLinea, eleccionCompleta, NOTA_MAXIMA, seleccionInicial,
  sePuedePedir, totalArticulos, totalCarrito, type Eleccion, type LineaCarrito,
} from "@/lib/menu/carrito";
import type { Categoria, MesaCliente, Producto, Restaurante } from "@/lib/menu/tipos";
import { MENSAJE_MESA } from "@/lib/pedidos";
import {
  IconoBasura, IconoBolsa, IconoBuscar, IconoCategoria, IconoCerrar, IconoCheck, IconoInfo, IconoMas, IconoReloj,
} from "./iconos";
import { Miniatura } from "./miniatura";
import s from "./menu.module.css";

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const idSeccion = (id: string) => `c-${id}`;
const reducirMovimiento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Abierto = { producto: Producto; categoria: Categoria } | null;

/** Clave única por envío: si el pedido se envía dos veces, el restaurante lo recibe una sola vez. */
function nuevaClave() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function MenuInteractivo({ restaurante, categorias, mesa }: { restaurante: Restaurante; categorias: Categoria[]; mesa?: MesaCliente }) {
  const Q = (c: number) => formatoDinero(c, restaurante.moneda);
  const [busqueda, setBusqueda] = useState("");
  const [activa, setActiva] = useState(categorias[0]?.id);
  const [lineas, setLineasBase] = useState<LineaCarrito[]>([]);
  // Cambia cada vez que cambia el pedido: un reintento del MISMO pedido usa la misma clave.
  const [clave, setClave] = useState("");
  const setLineas = (cambio: (ls: LineaCarrito[]) => LineaCarrito[]) => {
    setLineasBase(cambio);
    setClave(nuevaClave());
  };
  const [abierto, setAbierto] = useState<Abierto>(null);
  const [pedidoAbierto, setPedidoAbierto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const chipsRef = useRef<HTMLUListElement>(null);

  // Búsqueda sin acentos ni mayúsculas, por nombre de producto o categoría.
  const termino = normalizar(busqueda.trim());
  const visibles = useMemo(() => {
    if (!termino) return categorias;
    return categorias
      .map((c) => ({ ...c, productos: c.productos.filter((p) => normalizar(`${p.nombre} ${c.nombre}`).includes(termino)) }))
      .filter((c) => c.productos.length > 0);
  }, [categorias, termino]);

  // Resalta la categoría que se está viendo al desplazarse.
  useEffect(() => {
    if (termino) return;
    const secciones = categorias.map((c) => document.getElementById(idSeccion(c.id))).filter((e): e is HTMLElement => !!e);
    const observador = new IntersectionObserver(
      (entradas) => {
        const visible = entradas.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiva(visible.target.id.slice(2));
      },
      { rootMargin: "-160px 0px -55% 0px" },
    );
    secciones.forEach((e) => observador.observe(e));
    return () => observador.disconnect();
  }, [categorias, termino]);

  // Mantiene el chip activo a la vista.
  useEffect(() => {
    const chip = chipsRef.current?.querySelector<HTMLElement>(`[data-cat="${activa}"]`);
    const lista = chipsRef.current;
    if (chip && lista) lista.scrollTo({ left: chip.offsetLeft - lista.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
  }, [activa]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 1800);
    return () => clearTimeout(t);
  }, [aviso]);

  const cantidadEn = (productoId: string) => lineas.filter((l) => l.productoId === productoId).reduce((n, l) => n + l.cantidad, 0);
  const articulos = totalArticulos(lineas);
  const iconoDe = (productoId: string) =>
    categorias.find((c) => c.productos.some((p) => p.id === productoId))?.icono ?? "plato";
  const imagenDe = (productoId: string) =>
    categorias.flatMap((c) => c.productos).find((p) => p.id === productoId)?.imagen ?? null;

  function irA(e: React.MouseEvent, id: string) {
    e.preventDefault();
    setActiva(id);
    document.getElementById(idSeccion(id))?.scrollIntoView({ behavior: reducirMovimiento() ? "auto" : "smooth" });
  }

  function agregar(linea: LineaCarrito) {
    setLineas((ls) => agregarLinea(ls, linea));
    setAviso(`${linea.cantidad} × ${linea.nombre} agregado`);
    setAbierto(null);
  }

  return (
    <main id="menu" className={s.menu} aria-label={`Menú de ${restaurante.nombre}`}>
      <div className={s.barra}>
        <div className={s.barraFila}>
          <div className={s.marca}>
            {restaurante.logo && <Image src={restaurante.logo} alt="" width={52} height={38} />}
            <div>
              <span className={s.marcaNombre}>{restaurante.nombre}</span>
              {mesa ? <span className={s.mesa}>{mesa.etiqueta}</span>
                : restaurante.direccion && <span className={s.marcaSub}>{restaurante.direccion}</span>}
            </div>
          </div>
          <button type="button" className={s.botonIcono} onClick={() => setPedidoAbierto(true)}
            aria-label={articulos ? `Ver mi pedido, ${articulos} artículos` : "Ver mi pedido"}>
            <IconoBolsa size={21} />
            {articulos > 0 && <span className={s.globo} aria-hidden="true">{articulos}</span>}
          </button>
        </div>

        <label className={s.buscador}>
          <IconoBuscar />
          <input type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); window.scrollTo({ top: document.getElementById("menu")!.offsetTop }); }}
            placeholder="Buscar platillo o bebida…" autoComplete="off" aria-label="Buscar productos" enterKeyHint="search" />
          {busqueda && (
            <button type="button" className={s.limpiar} onClick={() => setBusqueda("")} aria-label="Limpiar búsqueda">
              <IconoCerrar size={16} />
            </button>
          )}
        </label>

        {!termino && (
          <nav aria-label="Categorías">
            <ul className={s.chips} ref={chipsRef}>
              {categorias.map((c) => (
                <li key={c.id}>
                  <a href={`#${idSeccion(c.id)}`} data-cat={c.id} onClick={(e) => irA(e, c.id)}
                    className={`${s.chip} ${activa === c.id ? s.chipActivo : ""}`} aria-current={activa === c.id ? "true" : undefined}>
                    <IconoCategoria icono={c.icono} grosor={2} />
                    {c.nombre}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      <div aria-live="polite" className="sr-only">
        {termino && `${visibles.reduce((n, c) => n + c.productos.length, 0)} resultados`}
      </div>

      {visibles.map((c) => (
        <section key={c.id} id={idSeccion(c.id)} className={s.seccion} aria-labelledby={`t-${c.id}`}>
          <div className={s.cabecera}>
            <h2 id={`t-${c.id}`} className={s.seccionTitulo}>{c.nombre}</h2>
            {c.descripcion && !termino && <p className={s.seccionNota}>{c.descripcion}</p>}
          </div>
          {c.imagen && !termino && (
            <div className={s.foto}>
              <Image src={c.imagen} alt={c.nombre} fill sizes="(min-width: 520px) 408px, calc(100vw - 32px)" />
            </div>
          )}
          <ul className={s.lista}>
            {c.productos.map((p) => (
              <li key={p.id}>
                <TarjetaProducto producto={p} icono={c.icono} cantidad={cantidadEn(p.id)} Q={Q}
                  onAbrir={() => setAbierto({ producto: p, categoria: c })} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {termino && visibles.length === 0 && (
        <div className={s.sinResultados}>
          <IconoBuscar size={40} />
          <b>Sin resultados</b>
          Prueba con otra palabra.
        </div>
      )}

      <footer className={s.pie}>
        <div className={s.pieGracias}>¡Gracias por tu preferencia!</div>
        <p>{[restaurante.tema.lema, restaurante.direccion].filter(Boolean).join(" · ")}</p>
        {restaurante.telefono && <p>Teléfono: <a href={`tel:${restaurante.telefono.replace(/[^\d+]/g, "")}`}>{restaurante.telefono}</a></p>}
        <div className={s.aviso}>
          {mesa ? (
            mesa.estado === "abierto"
              ? <><b>Pide desde tu teléfono.</b> Tu pedido llega directo al restaurante ({mesa.etiqueta}). El pago es en efectivo, con tu mesero, al terminar.</>
              : MENSAJE_MESA[mesa.estado]
          ) : (
            <><b>¿Quieres pedir desde tu teléfono?</b> Escanea el código QR de tu mesa. Desde esta página puedes armar tu pedido y mostrárselo a tu mesero;
              no se envía ni se guarda ningún dato tuyo.</>
          )}
        </div>
      </footer>

      {articulos > 0 && !pedidoAbierto && !abierto && (
        <button type="button" className={s.barraPedido} onClick={() => setPedidoAbierto(true)}>
          <span className={s.barraPedidoCuenta}>{articulos}</span>
          <span className={s.barraPedidoTexto}>Ver mi pedido</span>
          <span className={s.barraPedidoTotal}>{Q(totalCarrito(lineas))}</span>
        </button>
      )}

      {abierto && (
        <HojaProducto key={abierto.producto.id} {...abierto} Q={Q} conNota={mesa?.estado === "abierto"}
          onCerrar={() => setAbierto(null)} onAgregar={agregar} />
      )}
      {pedidoAbierto && (
        <HojaPedido lineas={lineas} Q={Q} iconoDe={iconoDe} imagenDe={imagenDe} onCerrar={() => setPedidoAbierto(false)}
          onCambiar={(c, d) => setLineas((ls) => cambiarCantidad(ls, c, d))} onVaciar={() => setLineas(() => [])}
          mesa={mesa} clave={clave} onEnviado={() => setLineasBase([])} />
      )}

      {aviso && (
        <div className={s.avisoFlotante} role="status">
          <IconoCheck size={16} />
          {aviso}
        </div>
      )}
    </main>
  );
}

type Formato = (centavos: number) => string;

function TarjetaProducto({ producto: p, icono, cantidad, Q, onAbrir }: {
  producto: Producto; icono: Categoria["icono"]; cantidad: number; Q: Formato; onAbrir: () => void;
}) {
  const disponible = sePuedePedir(p);
  return (
    <button type="button" className={s.producto} onClick={onAbrir}>
      <Miniatura imagen={p.imagen} icono={icono} />
      <span className={s.productoCuerpo}>
        <span className={s.productoNombre}>
          {p.nombre}
          {cantidad > 0 && <span className={s.cantidadEnCarrito}>×{cantidad}<span className="sr-only"> en tu pedido</span></span>}
        </span>
        {p.descripcion && <span className={s.productoNota}>{p.descripcion}</span>}
        {!p.descripcion && p.grupos[0] && (
          <span className={s.productoNota}>{p.grupos[0].nombre}: {p.grupos[0].opciones.map((o) => o.nombre).join(" o ")}</span>
        )}
        <span className={s.productoPie}>
          {p.precio === null ? <span className={s.precioPendiente}>Precio por confirmar</span> : <span className={s.precio}>{Q(p.precio)}</span>}
          {p.agotado && <span className={s.agotado}>Agotado</span>}
          <span className={`${s.agregar} ${disponible ? "" : s.agregarApagado}`} aria-hidden="true">
            {disponible ? <IconoMas size={16} /> : <IconoReloj size={15} />}
          </span>
        </span>
      </span>
    </button>
  );
}

/** Abre un <dialog> nativo en modo modal: atrapa el foco y se cierra con Esc. */
function useDialogo(onCerrar: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const alCerrarRef = useRef(onCerrar);
  useEffect(() => { alCerrarRef.current = onCerrar; });
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const alCerrar = () => alCerrarRef.current();
    d.addEventListener("close", alCerrar);
    return () => d.removeEventListener("close", alCerrar);
  }, []);
  // Tocar el fondo oscuro también cierra.
  const alTocar = (e: React.MouseEvent<HTMLDialogElement>) => { if (e.target === e.currentTarget) e.currentTarget.close(); };
  return { ref, alTocar, cerrar: () => ref.current?.close() };
}

function HojaProducto({ producto: p, categoria, Q, conNota, onCerrar, onAgregar }: {
  producto: Producto; categoria: Categoria; Q: Formato; conNota: boolean; onCerrar: () => void; onAgregar: (l: LineaCarrito) => void;
}) {
  const { ref, alTocar, cerrar } = useDialogo(onCerrar);
  const [cantidad, setCantidad] = useState(1);
  const [eleccion, setEleccion] = useState<Eleccion>(() => seleccionInicial(p.grupos));
  const [nota, setNota] = useState("");
  const linea = crearLinea(p, eleccion, cantidad, nota);
  const motivo = p.precio === null ? "Precio por confirmar" : p.agotado ? "Agotado" : !eleccionCompleta(p.grupos, eleccion) ? "Elige una opción" : null;

  return (
    <dialog ref={ref} className={s.hoja} onClick={alTocar} aria-labelledby="detalle-nombre">
      <div className={s.asa} />
      <button type="button" className={s.cerrar} onClick={cerrar} aria-label="Cerrar"><IconoCerrar /></button>
      <div className={s.hojaDesplazable}>
        <div className={s.detalleFoto}>
          {p.imagen ? <Image src={p.imagen} alt={p.nombre} fill sizes="(min-width: 520px) 412px, calc(100vw - 28px)" />
            : <IconoCategoria icono={categoria.icono} grosor={1.3} />}
        </div>
        <div className={s.detalleCuerpo}>
          <div className={s.detalleCategoria}>{categoria.nombre}</div>
          <h2 id="detalle-nombre" className={s.detalleNombre}>{p.nombre}</h2>
          {(p.descripcion ?? categoria.descripcion) && <p className={s.detalleNota}>{p.descripcion ?? categoria.descripcion}</p>}
          <div className={s.detallePrecio}>
            {p.precio === null ? <span className={s.precioPendiente}>Precio por confirmar</span> : Q(p.precio)}
          </div>
          {p.grupos.map((g) => (
            <fieldset key={g.id} className={s.grupo}>
              <legend>
                {g.nombre}
                {g.min > 0 && <span className={s.requerido}>{g.max > 1 ? `Elige ${g.min}–${g.max}` : "Requerido"}</span>}
              </legend>
              {g.opciones.map((o) => (
                <label key={o.id} className={s.opcion}>
                  {o.nombre}
                  {o.extra > 0 && <span className={s.opcionExtra}>+{Q(o.extra)}</span>}
                  <input type={g.max === 1 ? "radio" : "checkbox"} name={g.id} checked={(eleccion[g.id] ?? []).includes(o.id)}
                    onChange={() => setEleccion((e) => alternarOpcion(e, g, o.id))} />
                </label>
              ))}
            </fieldset>
          ))}
          {conNota && sePuedePedir(p) && (
            <label className={s.campo}>
              <span>Observaciones <small>(opcional)</small></span>
              <textarea rows={2} maxLength={NOTA_MAXIMA} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. sin cebolla, término medio" />
            </label>
          )}
        </div>
      </div>
      <div className={s.hojaPie}>
        <div className={s.contador} role="group" aria-label="Cantidad">
          <button type="button" onClick={() => setCantidad((n) => n - 1)} disabled={cantidad <= 1} aria-label="Menos">−</button>
          <output aria-live="polite">{cantidad}</output>
          <button type="button" onClick={() => setCantidad((n) => n + 1)} disabled={cantidad >= CANTIDAD_MAXIMA} aria-label="Más">+</button>
        </div>
        <button type="button" className={s.botonPrincipal} disabled={!linea} onClick={() => linea && onAgregar(linea)}>
          <span>{motivo ?? "Agregar"}</span>
          {linea && <span className={s.num}>{Q(linea.precioUnitario * linea.cantidad)}</span>}
        </button>
      </div>
    </dialog>
  );
}

function HojaPedido({ lineas, Q, iconoDe, imagenDe, onCerrar, onCambiar, onVaciar, mesa, clave, onEnviado }: {
  lineas: LineaCarrito[]; Q: Formato; iconoDe: (id: string) => Categoria["icono"]; imagenDe: (id: string) => string | null;
  onCerrar: () => void; onCambiar: (clave: string, delta: number) => void; onVaciar: () => void;
  mesa?: MesaCliente; clave: string; onEnviado: () => void;
}) {
  const { ref, alTocar, cerrar } = useDialogo(onCerrar);
  const [resumen, setResumen] = useState(false);
  const [enviar, setEnviar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const router = useRouter();
  const total = totalCarrito(lineas);
  const puedePedir = mesa?.estado === "abierto";

  function mandar(datos: FormData) {
    if (!mesa || enviando) return;
    setError(null);
    iniciar(async () => {
      const r = await enviarPedido({
        mesa: mesa.codigo, clave, nombre: String(datos.get("nombre") ?? ""), notas: String(datos.get("notas") ?? ""),
        lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, opciones: l.opciones, nota: l.nota })),
      });
      if ("error" in r) { setError(r.error); return; }
      onEnviado();
      router.push(`/pedido/${r.token}?m=${mesa.codigo}`);
    });
  }

  return (
    <dialog ref={ref} className={s.hoja} onClick={alTocar} aria-label={resumen ? "Resumen para el mesero" : enviar ? "Enviar pedido" : "Tu pedido"}>
      <div className={s.asa} />
      <button type="button" className={s.cerrar} onClick={cerrar} aria-label="Cerrar"><IconoCerrar /></button>

      {enviar && mesa ? (
        <form action={mandar} className="contents">
          <div className={s.hojaDesplazable}>
            <div className={s.pedidoCabecera}>
              <h2>Enviar a {mesa.etiqueta}</h2>
            </div>
            <div className={s.recibo}>
              {lineas.map((l) => (
                <div key={l.clave} className={s.fila}>
                  <span>
                    {l.cantidad} × {l.nombre}{l.detalle.length > 0 && ` (${l.detalle.join(", ")})`}
                    {l.nota && <span className={s.lineaNota}>“{l.nota}”</span>}
                  </span>
                  <span>{Q(l.cantidad * l.precioUnitario)}</span>
                </div>
              ))}
              <div className={`${s.fila} ${s.filaTotal}`}><span>Total</span><span>{Q(total)}</span></div>
            </div>
            <div className={s.formEnvio}>
              <label className={s.campo}>
                <span>Tu nombre <small>(opcional, para que el mesero te ubique)</small></span>
                <input name="nombre" maxLength={60} autoComplete="given-name" />
              </label>
              <label className={s.campo}>
                <span>Notas para el restaurante <small>(opcional)</small></span>
                <textarea name="notas" rows={2} maxLength={500} placeholder="Ej. traer todo junto" />
              </label>
            </div>
            {error && <p role="alert" className={s.errorEnvio}>{error}</p>}
            <p className={s.notaPedido}><IconoInfo size={15} />El precio final lo confirma el restaurante. El pago es en efectivo, con tu mesero, al terminar.</p>
          </div>
          <div className={s.hojaPie}>
            <button type="button" className={s.vaciar} onClick={() => setEnviar(false)} disabled={enviando}>Volver</button>
            <button type="submit" className={s.botonPrincipal} disabled={enviando} aria-busy={enviando}>
              <span>{enviando ? "Enviando…" : "Enviar pedido"}</span><span className={s.num}>{Q(total)}</span>
            </button>
          </div>
        </form>
      ) : resumen ? (
        <>
          <div className={s.hojaDesplazable}>
            <div className={s.resumenFinal}>
              <div className={s.sello}><IconoCheck size={34} /></div>
              <h2>Tu pedido</h2>
              <p>Muestra esta pantalla a tu mesero para ordenar.</p>
            </div>
            <div className={s.recibo}>
              {lineas.map((l) => (
                <div key={l.clave} className={s.fila}>
                  <span>{l.cantidad} × {l.nombre}{l.detalle.length > 0 && ` (${l.detalle.join(", ")})`}</span>
                  <span>{Q(l.cantidad * l.precioUnitario)}</span>
                </div>
              ))}
              <div className={`${s.fila} ${s.filaTotal}`}><span>Total</span><span>{Q(total)}</span></div>
            </div>
            <p className={s.advertencia}>Este resumen no se envía al restaurante y no se ha cobrado nada: muéstraselo a tu mesero.</p>
          </div>
          <div className={s.hojaPie}>
            <button type="button" className={s.botonPrincipal} onClick={() => setResumen(false)}>Volver a mi pedido</button>
          </div>
        </>
      ) : lineas.length === 0 ? (
        <div className={s.vacio}>
          <IconoBolsa size={54} />
          <b>Tu pedido está vacío</b>
          Agrega platillos y bebidas desde el menú.
        </div>
      ) : (
        <>
          <div className={s.hojaDesplazable}>
            <div className={s.pedidoCabecera}>
              <h2>Tu pedido</h2>
              <button type="button" className={s.vaciar} onClick={onVaciar}>Vaciar</button>
            </div>
            <ul className={s.lineas}>
              {lineas.map((l) => (
                <li key={l.clave} className={s.linea}>
                  <Miniatura imagen={imagenDe(l.productoId)} icono={iconoDe(l.productoId)} tamano={54} />
                  <div className={s.lineaCuerpo}>
                    <b>{l.nombre}</b>
                    <small>{l.detalle.length > 0 ? `Con ${l.detalle.join(", ")}` : `${Q(l.precioUnitario)} c/u`}</small>
                    {l.nota && <small className={s.lineaNota}>“{l.nota}”</small>}
                    <span className={s.precio}>{Q(l.precioUnitario * l.cantidad)}</span>
                  </div>
                  <div className={s.mini} role="group" aria-label={`Cantidad de ${l.nombre}`}>
                    <button type="button" onClick={() => onCambiar(l.clave, -1)} aria-label={l.cantidad === 1 ? "Quitar" : "Uno menos"}>
                      {l.cantidad === 1 ? <IconoBasura size={14} /> : "−"}
                    </button>
                    <span>{l.cantidad}</span>
                    <button type="button" onClick={() => onCambiar(l.clave, 1)} disabled={l.cantidad >= CANTIDAD_MAXIMA} aria-label="Uno más">+</button>
                  </div>
                </li>
              ))}
            </ul>
            <div className={s.resumen}>
              <div className={s.fila}><span>Artículos</span><span>{totalArticulos(lineas)}</span></div>
              <div className={`${s.fila} ${s.filaTotal}`}><span>Total</span><span>{Q(total)}</span></div>
            </div>
            <p className={s.notaPedido}>
              <IconoInfo size={15} />
              {puedePedir ? "Revisa tu pedido y envíalo: llega directo al restaurante."
                : mesa ? MENSAJE_MESA[mesa.estado as Exclude<MesaCliente["estado"], "abierto">]
                : "Para pedir desde tu teléfono, escanea el código QR de tu mesa. Aquí puedes mostrarle el resumen a tu mesero."}
            </p>
          </div>
          <div className={s.hojaPie}>
            {puedePedir ? (
              <button type="button" className={s.botonPrincipal} onClick={() => { setError(null); setEnviar(true); }}>
                <span>Continuar</span><span className={s.num}>{Q(total)}</span>
              </button>
            ) : (
              <button type="button" className={s.botonPrincipal} onClick={() => setResumen(true)}>
                <span>Ver resumen</span><span className={s.num}>{Q(total)}</span>
              </button>
            )}
          </div>
        </>
      )}
    </dialog>
  );
}
