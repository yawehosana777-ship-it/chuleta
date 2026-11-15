// Permisos y roles (deben coincidir con los tipos de la base de datos).
export const PERMISOS = [
  "menu.edit", "settings.edit", "staff.manage",
  "orders.view", "orders.accept", "orders.update", "orders.cancel", "tables.manage", "reports.view",
] as const;
export type Permiso = (typeof PERMISOS)[number];
export type Rol = "owner" | "manager" | "staff";

export const NOMBRE_ROL: Record<Rol, string> = { owner: "Dueño", manager: "Gerente", staff: "Personal" };

/** Descripción para el dueño. Los de pedidos y mesas se usarán desde la Fase 4. */
export const DESCRIPCION_PERMISO: Record<Permiso, { nombre: string; detalle: string; fase?: number }> = {
  "menu.edit": { nombre: "Editar el menú", detalle: "Productos, precios, fotos y agotados." },
  "settings.edit": { nombre: "Datos del restaurante", detalle: "Nombre, dirección, logo y colores." },
  "staff.manage": { nombre: "Administrar empleados", detalle: "Solo dueño y gerentes." },
  "orders.view": { nombre: "Ver pedidos", detalle: "Lista de pedidos.", fase: 4 },
  "orders.accept": { nombre: "Aceptar pedidos", detalle: "Mandar pedidos a cocina.", fase: 4 },
  "orders.update": { nombre: "Actualizar pedidos", detalle: "Preparación, listo, entregado.", fase: 4 },
  "orders.cancel": { nombre: "Cancelar pedidos", detalle: "Con motivo obligatorio.", fase: 4 },
  "tables.manage": { nombre: "Mesas", detalle: "Crear mesas y cerrar cuentas.", fase: 4 },
  "reports.view": { nombre: "Informes", detalle: "Ventas y estadísticas.", fase: 6 },
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
