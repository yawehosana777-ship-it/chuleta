# Guía para dar de alta un restaurante nuevo

Tiempo aproximado: 30–60 minutos, la mayoría cargando el menú.

## 1. Crear el restaurante e invitar al dueño (administrador de la plataforma)
En Supabase › **SQL Editor** (proyecto de producción):
```sql
select create_restaurant_invite('Nombre del Restaurante', 'nombre-en-la-direccion', 'correo-del-dueno@ejemplo.com');
```
- El segundo dato es cómo se verá en la dirección: `https://<sitio>/r/nombre-en-la-direccion`
  (minúsculas, números y guiones; no se puede cambiar después desde el panel).
- Devuelve un código. El enlace para el dueño es `https://<sitio>/acceso/invitacion/<código>`:
  sirve una sola vez, solo con ese correo, durante 72 horas.
- Si vence: `select new_invitation_token('nombre-en-la-direccion', 'correo@ejemplo.com', 'owner');`

## 2. El dueño entra y configura (todo desde su teléfono)
1. Abre el enlace, crea su contraseña y entra al panel.
2. **Restaurante:** nombre, dirección, teléfono, logo, portada, plantilla y colores.
3. **Restaurante › Pedidos y horario:** horario real, pedidos en mesa y/o a domicilio (zona, costo, mínimo).
4. **Menú:** categorías, productos, precios, fotos y opciones. Lo que no tenga precio se muestra como
   "Precio por confirmar" y no se puede pedir.
5. **Mesas:** crear las mesas, descargar e imprimir los códigos QR (solo con la dirección definitiva).
6. **Empleados:** crear usuarios para meseros y cocina con los permisos que necesiten; entran en
   `https://<sitio>/acceso/empleado?r=nombre-en-la-direccion`.
7. **Restaurante › Áreas y avisos:** si tiene cocina y barra separadas, crear las áreas y asignar las categorías.

## 3. Revisión antes de abrir
- Abrir el menú en un teléfono y revisar precios.
- Hacer un pedido de prueba por mesa y otro a domicilio, llevarlos hasta "Entregado" y cerrar la cuenta.
- Borrar esos pedidos de prueba (pedirlo al administrador; se hace en el SQL Editor) para que no cuenten en Informes.

## Suspender o reactivar un restaurante
```sql
select set_restaurant_status('nombre-en-la-direccion', 'suspended');  -- o 'active'
```
Suspendido: el menú deja de verse y su equipo no puede entrar al panel. Los datos se conservan.
