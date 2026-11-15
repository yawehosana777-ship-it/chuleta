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
  moneda: string;
  logo: string | null;
  portada: string | null;
  tema: Tema;
};

export type MenuPublico = { restaurante: Restaurante; categorias: Categoria[] };
