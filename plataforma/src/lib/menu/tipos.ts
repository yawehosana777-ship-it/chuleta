import type { Tema } from "./temas";

export const ICONOS = ["plato", "carne", "hamburguesa", "alitas", "postre", "cerveza", "fria", "caliente", "tequila"] as const;
export type Icono = (typeof ICONOS)[number];

export type Opcion = { id: string; nombre: string; extra: number };
export type GrupoOpciones = { id: string; nombre: string; min: number; max: number; opciones: Opcion[] };

export type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  /** Centavos. null = precio por confirmar (se muestra, pero no se puede pedir). */
  precio: number | null;
  agotado: boolean;
  destacado: boolean;
  /** Promoción vigente: centavos de descuento por unidad (0 = sin promoción). */
  descuento: number;
  promocion: string | null;
  etiquetaPromocion: string | null;
  imagen: string | null;
  grupos: GrupoOpciones[];
};

export type Categoria = {
  id: string;
  nombre: string;
  descripcion: string | null;
  icono: Icono;
  imagen: string | null;
  productos: Producto[];
};

export type Restaurante = {
  slug: string;
  nombre: string;
  descripcion: string | null;
  direccion: string | null;
  telefono: string | null;
  /** Número de WhatsApp listo para el enlace (con código de país). Con número, los pedidos se hacen por WhatsApp. */
  whatsapp: string | null;
  moneda: string;
  logo: string | null;
  portada: string | null;
  tema: Tema;
  /** null = el restaurante no ofrece domicilio desde la página. */
  domicilio: Domicilio | null;
};

/** Condiciones de entrega a domicilio (centavos; 0 = gratis / sin mínimo). */
export type Domicilio = { zona: string | null; envio: number; minimo: number };

export type MenuPublico = { restaurante: Restaurante; categorias: Categoria[] };

/** Mesa desde la que se abrió el menú (código QR). */
export type MesaCliente = { codigo: string; etiqueta: string; estado: "abierto" | "cerrado" | "pausado" | "sin_servicio" };
