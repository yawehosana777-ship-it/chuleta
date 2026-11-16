// Convierte las filas de Supabase en el menú que ve el cliente:
// ordena, quita lo inactivo y valida imágenes y tema.
// No depende del servidor, así se puede probar sin conexión.
import { urlImagen } from "./imagenes";
import { leerTema } from "./temas";
import { ICONOS, type Categoria, type Icono, type MenuPublico } from "./tipos";

type ConPosicion = { position: number };

export type FilaRestaurante = {
  slug: string;
  name: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  currency: string;
  logo_path: string | null;
  cover_path: string | null;
  theme: unknown;
  delivery_enabled?: boolean;
  delivery_settings?: FilaEntrega | FilaEntrega[] | null;
};

type FilaEntrega = { method: string; fixed_fee_cents: number | null; min_order_cents: number; area_note: string | null };

/** Solo el método de costo fijo (incluye 0 = gratis) se ofrece desde la página. */
function leerDomicilio(r: FilaRestaurante) {
  const e = Array.isArray(r.delivery_settings) ? r.delivery_settings[0] : r.delivery_settings;
  if (!r.delivery_enabled || !e || e.method !== "fixed") return null;
  return { zona: e.area_note, envio: e.fixed_fee_cents ?? 0, minimo: e.min_order_cents };
}

export type FilaCategoria = ConPosicion & {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  image_path: string | null;
  active: boolean;
  products: (ConPosicion & {
    id: string;
    name: string;
    description: string | null;
    price_cents: number | null;
    active: boolean;
    sold_out: boolean;
    featured: boolean;
    product_images: (ConPosicion & { storage_path: string })[];
    option_groups: (ConPosicion & {
      id: string;
      name: string;
      min_select: number;
      max_select: number;
      options: (ConPosicion & { id: string; name: string; price_delta_cents: number; active: boolean })[];
    })[];
  })[];
};

const ordenar = <T extends ConPosicion>(filas: T[] | null | undefined) =>
  [...(filas ?? [])].sort((a, b) => a.position - b.position);

const icono = (valor: string): Icono => ((ICONOS as readonly string[]).includes(valor) ? (valor as Icono) : "plato");

export function armarMenu(r: FilaRestaurante, filas: FilaCategoria[], urlSupabase: string): MenuPublico {
  const categorias: Categoria[] = ordenar(filas)
    .filter((c) => c.active)
    .map((c) => ({
      id: c.id,
      nombre: c.name,
      descripcion: c.description,
      icono: icono(c.icon),
      imagen: urlImagen(c.image_path, urlSupabase),
      productos: ordenar(c.products)
        .filter((p) => p.active)
        .map((p) => ({
          id: p.id,
          nombre: p.name,
          descripcion: p.description,
          precio: p.price_cents,
          agotado: p.sold_out,
          destacado: p.featured,
          imagen: ordenar(p.product_images).map((i) => urlImagen(i.storage_path, urlSupabase)).find(Boolean) ?? null,
          grupos: ordenar(p.option_groups)
            .map((g) => ({
              id: g.id,
              nombre: g.name,
              min: g.min_select,
              max: g.max_select,
              opciones: ordenar(g.options)
                .filter((o) => o.active)
                .map((o) => ({ id: o.id, nombre: o.name, extra: o.price_delta_cents })),
            }))
            .filter((g) => g.opciones.length > 0),
        })),
    }))
    .filter((c) => c.productos.length > 0);

  return {
    restaurante: {
      slug: r.slug,
      nombre: r.name,
      descripcion: r.description,
      direccion: r.address,
      telefono: r.phone,
      moneda: r.currency,
      logo: urlImagen(r.logo_path, urlSupabase),
      portada: urlImagen(r.cover_path, urlSupabase),
      tema: leerTema(r.theme),
      domicilio: leerDomicilio(r),
    },
    categorias,
  };
}
