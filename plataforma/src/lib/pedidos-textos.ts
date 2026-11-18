// Textos de pedidos que usan las pantallas del navegador (menú del cliente,
// horario del panel). Están aparte de pedidos.ts para que el teléfono no
// tenga que descargar la librería de validación (Zod) solo por estos textos.

// Estado de la mesa que devuelve table_by_qr.
export type EstadoMesa = "abierto" | "cerrado" | "pausado" | "sin_servicio";
export const MENSAJE_MESA: Record<Exclude<EstadoMesa, "abierto">, string> = {
  cerrado: "En este momento el restaurante está fuera de horario y no recibe pedidos desde el teléfono. Puedes ver el menú y pedirle a tu mesero.",
  pausado: "El restaurante pausó los pedidos por un momento (mucho trabajo en cocina). Puedes pedirle a tu mesero.",
  sin_servicio: "Este restaurante no recibe pedidos desde el teléfono. Puedes ver el menú y pedirle a tu mesero.",
};

export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;
