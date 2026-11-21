// Permisos y roles (deben coincidir con los tipos de la base de datos).
export const PERMISOS = [
  "menu.edit", "settings.edit", "staff.manage",
  "orders.view", "orders.accept", "orders.update", "orders.cancel", "tables.manage", "reports.view",
] as const;
export type Permiso = (typeof PERMISOS)[number];
export type Rol = "owner" | "manager" | "staff";

export const NOMBRE_ROL: Record<Rol, string> = { owner: "Dueño", manager: "Gerente", staff: "Personal" };

/** Descripción para el dueño. */
export const DESCRIPCION_PERMISO: Record<Permiso, { nombre: string; detalle: string; fase?: number }> = {
  "menu.edit": { nombre: "Editar el menú", detalle: "Productos, precios, fotos y agotados." },
  "settings.edit": { nombre: "Datos del restaurante", detalle: "Nombre, dirección, logo, colores, horario y pausa de pedidos." },
  "staff.manage": { nombre: "Administrar empleados", detalle: "Solo dueño y gerentes." },
  "orders.view": { nombre: "Ver pedidos", detalle: "Lista de pedidos que llegan." },
  "orders.accept": { nombre: "Aceptar pedidos", detalle: "Mandar pedidos nuevos a cocina." },
  "orders.update": { nombre: "Actualizar pedidos", detalle: "En preparación, listo, entregado." },
  "orders.cancel": { nombre: "Cancelar pedidos", detalle: "Con motivo obligatorio." },
  "tables.manage": { nombre: "Mesas", detalle: "Crear mesas, códigos QR y cerrar cuentas (cobro en efectivo)." },
  "reports.view": { nombre: "Informes", detalle: "Ventas, cobros y más vendidos." },
};

/** Permisos que se pueden dar a un empleado de tipo "Personal". */
export const PERMISOS_PERSONAL = PERMISOS.filter((p) => p !== "staff.manage");

export function permisosEfectivos(rol: Rol, asignados: string[]): Set<Permiso> {
  if (rol === "owner" || rol === "manager") return new Set(PERMISOS);
  return new Set(asignados.filter((p): p is Permiso => (PERMISOS as readonly string[]).includes(p) && p !== "staff.manage"));
}

// Los empleados entran con usuario + contraseña. Supabase Auth necesita un
// correo, así que se usa uno interno que nunca recibe mensajes:
// <usuario>.<restaurante>@empleados.invalid (".invalid" es un dominio reservado).
export const DOMINIO_EMPLEADOS = "empleados.invalid";
export const USUARIO_VALIDO = /^[a-z0-9._-]{3,40}$/;
export const correoEmpleado = (usuario: string, slug: string) => `${usuario.toLowerCase()}.${slug}@${DOMINIO_EMPLEADOS}`;
