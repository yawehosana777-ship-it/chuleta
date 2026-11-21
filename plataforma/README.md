# Plataforma de menús digitales — Fases 1 a 7

Aplicación Next.js + Supabase. Plan completo en [`../docs/plan-plataforma.md`](../docs/plan-plataforma.md).

## Qué funciona en la Fase 1

| Función | Estado |
|---|---|
| Base de datos completa (restaurantes, menú, mesas, pedidos, entregas, avisos, auditoría) | ✅ Migraciones listas |
| Aislamiento entre restaurantes (RLS) | ✅ 23 pruebas automáticas |
| Alta de restaurante + invitación de un solo uso | ✅ Desde el SQL Editor |
| Dueño crea su cuenta desde la invitación | ✅ `/acceso/invitacion/<token>` |
| Inicio y cierre de sesión | ✅ `/acceso` |
| Panel básico (muestra los restaurantes del usuario) | ✅ `/panel` |
| Carta real de Don Chuleta cargada en la base | ✅ Desde el SQL Editor |
| Menú del cliente leyendo la base de datos | ✅ Fase 2 · `/r/<slug>` |
| Bienvenida, portada, buscador, categorías, detalle con opciones | ✅ Fase 2 |
| Carrito y resumen para mostrar al mesero (no se envía ni se guarda) | ✅ Fase 2 |
| Plantillas de tema (`parrilla`, `claro`, `campo`) y colores propios validados | ✅ Fase 2 |
| Pedidos de mesa por código QR, cuenta compartida, seguimiento del cliente | ✅ Fase 4A · `/r/<slug>/mesa/<código>` |
| Panel de pedidos y mesas, horario, pausa, cierre de cuenta en efectivo | ✅ Fase 4A |
| Pedidos a domicilio (gratis, solo Malacatancito, efectivo al recibir) | ✅ Fase 4B · desde `/r/<slug>` |
| Aviso en vivo con sonido, pantalla de cocina por áreas, encargado, avisos de atraso | ✅ Fase 5 · Cocina y áreas sin enlace en el panel desde 20-nov-2026 |
| Pedidos por WhatsApp (enlace normal wa.me, sin API) | ✅ 20-nov-2026 · se activa al escribir el número en Restaurante |
| Promociones con fechas, destacados («Recomendados») e informes de ventas | ✅ Fase 6 · Promociones sin enlace en el panel desde 20-nov-2026 |
| Panel: menú, agotados, fotos, datos y colores del restaurante | ✅ Fase 3 · `/panel/<slug>` |
| Empleados con usuario y contraseña, permisos y desactivación | ✅ Fase 3 · sin enlace en el panel desde 20-nov-2026 |

## Cómo se puso en marcha (ya hecho en el proyecto `uqwojpsvrfoqsfaldkhj`)

La Fase 1 **no necesita la clave secreta**: todo lo administrativo se ejecuta en
Supabase › **SQL Editor** (rol `postgres`) y la invitación se verifica dentro de la base de datos.

1. **Clave pública:** `.env.local` lleva `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   `SUPABASE_SECRET_KEY` puede seguir vacía: solo la usa "Olvidó su contraseña" del panel. **Nunca compartas la clave secreta.**
2. **Tablas:** pegar y ejecutar `supabase/sql-editor/01-crear-tablas.sql` (las 3 migraciones juntas).
   Si Supabase avisa de RLS, elegir **"Run and enable RLS"**.
3. **Authentication › Sign In / Providers › Email:** "Confirm email" **desactivado** (el correo gratuito
   de Supabase solo llega a miembros del proyecto). Se reactiva en la Fase 8 con un correo propio.
4. **Alta de Don Chuleta** (devuelve el token de invitación):
   ```sql
   select create_restaurant_invite('Don Chuleta', 'don-chuleta', 'CORREO_DEL_DUEÑO');
   ```
5. **Carta:** pegar y ejecutar `supabase/sql-editor/03-cargar-carta.sql` (no duplica si se repite).
6. **Fase 2:** ejecutar `supabase/sql-editor/04-fase-2.sql` (íconos y fotos por categoría) y luego
   `05-presentacion-don-chuleta.sql` (dirección, logo, portada, tema). El segundo se puede repetir.
7. **Fase 3:** ejecutar `supabase/sql-editor/06-fase-3.sql` (espacio de fotos `menu` y funciones de empleados).
8. **Fase 4A:** ejecutar `supabase/sql-editor/07-fase-4a.sql` (pedidos de mesa, horario, estados y cierre de cuenta).
9. **Fase 4B:** ejecutar `supabase/sql-editor/08-fase-4b.sql` (pedidos a domicilio).
10. **Fase 5:** ejecutar `supabase/sql-editor/09-fase-5.sql` (tiempo real de pedidos, áreas, encargado, avisos de atraso).
11. **Fase 6:** ejecutar `supabase/sql-editor/10-fase-6.sql` (promociones e informes).
12. **Fase 7:** ejecutar `supabase/sql-editor/11-fase-7.sql` (endurecimiento y límite de pedidos por minuto).

> Las migraciones se aplicaron a mano, así que la CLI de Supabase no las tiene registradas.
> Antes de usar `supabase db push` en el futuro:
> `npx supabase migration repair --status applied 20261116000100 20261116000200 20261116000300 20261116000400 20261116000500 20261116000600 20261116000700 20261116000800 20261116000900 20261116001000`

## Menú del cliente (Fase 2)
- Dirección: `http://localhost:3000/r/don-chuleta`. Solo se ven restaurantes **activos** y productos/categorías activos.
- Se lee con un cliente **anónimo** (sin sesión), así el dueño ve exactamente lo mismo que un cliente.
- Los menús de restaurantes activos se preparan completos al compilar (`generateStaticParams`) y se
  renuevan solos: el HTML llega con el menú, sin pantalla de carga intermedia.
- Caché de ~1 minuto: un cambio en la base (precio, agotado, nombre) aparece solo, sin volver a publicar.
- Lighthouse móvil (producción en localhost, nov-2026): Accesibilidad 100 · Buenas prácticas 100 · SEO 100 ·
  Rendimiento 89–90 (simulado) / 91–92 (limitación real). Para medir:
  `npm run build`, `npx next start -p 3001` y `npx lighthouse http://localhost:3001/r/don-chuleta --form-factor=mobile`.
  Al guardar desde el panel, la caché se invalida al instante (`etiquetaMenu` en `src/server/menu-publico.ts`).
- Imágenes: por ahora las de Don Chuleta viven en `public/menus/don-chuleta/`. Las rutas que no empiezan
  con `/` se leen del bucket público `menu` de Supabase Storage (lo usa el panel para las fotos que sube el dueño).
- Tema: `restaurants.theme` = `{ "plantilla": "parrilla" | "claro" | "campo", "colores": {...}, "lema": "...", "etiquetas": [...] }`.
  Colores inválidos se ignoran (no se puede inyectar CSS).
- El carrito vive solo en la memoria del teléfono: no se guarda ni se envía. El resumen dice claramente que
  hay que mostrárselo al mesero.

### Prueba
```
npm run dev
```
1. Abrir `http://localhost:3000/acceso/invitacion/<token>` → crear la contraseña → el panel muestra "Don Chuleta · Dueño · Activo".
2. Cerrar sesión y volver a entrar en `http://localhost:3000/acceso`.
3. Abrir el enlace de invitación otra vez → debe decir "ya fue utilizada".

> **Si no deja entrar aunque la contraseña es correcta:** revisa que la hora de la computadora
> sea la correcta (Windows › Fecha y hora › "Establecer la hora automáticamente"). Con el reloj
> desfasado, la sesión parece vencida y el panel regresa a la pantalla de acceso.

## Panel de administración (Fase 3)
- Entrada: `/panel` → `/panel/<slug>`. Cada pestaña aparece solo si el usuario tiene el permiso
  (Menú = `menu.edit`, Restaurante = `settings.edit`, Empleados = `staff.manage`). Dueño y gerente tienen todos.
- El restaurante **siempre** sale de la sesión (`src/server/panel/contexto.ts`); el slug de la URL solo elige entre
  los restaurantes del usuario. Sin permiso → "No autorizado"; sin membresía activa → 404.
- Al guardar, el menú público se actualiza al instante (`updateTag`) y la pantalla del panel se refresca (`refresh`).
- **Fotos:** se reducen en el teléfono (WebP, máx. 1600 px) y el servidor revisa los bytes del archivo (JPG/PNG/WebP,
  máx. 2.5 MB). Se guardan en el bucket `menu` dentro de la carpeta del restaurante; la base de datos solo deja
  subir a quien tiene `menu.edit` en ese restaurante.
- **Empleados (sin clave secreta):** el dueño elige usuario y contraseña temporal. La cuenta se crea con el registro
  público de Supabase usando un correo interno `<usuario>.<slug>@empleados.invalid` (no es un correo real) y la
  función `create_staff_member` la vincula solo si es nueva, coincide con el usuario y quien la pide tiene `staff.manage`.
  Al primer ingreso el empleado **debe** cambiar la contraseña. Desactivarlo le quita el acceso al momento.
- **"Olvidó su contraseña"** necesita `SUPABASE_SECRET_KEY` en el servidor. Sin ella, el panel lo explica:
  desactivar al empleado y crearle un usuario nuevo.

### Prueba realizada (15-nov-2026)
1. Dueño: Agotado en "Chuleta" → el menú público mostró "AGOTADO" al instante; se regresó.
2. Dueño: creó "Mesero de Prueba" (`prueba.mesero`, solo "Editar el menú").
3. Empleado: al entrar fue obligado a cambiar la contraseña (abrir el menú directo lo regresaba); después vio solo
   la pestaña Menú. Restaurante y Empleados → "No autorizado".
4. Dueño: lo desactivó → el empleado recibe 404 en el panel.
## Pedidos de mesa (Fase 4A)
- **Cliente:** escanea el QR de su mesa → `/r/<slug>/mesa/<código>` (código aleatorio de 24 caracteres, no se puede adivinar).
  Arma su pedido con observaciones por producto, nombre y notas opcionales, y lo envía. Pasa a `/pedido/<código-secreto>`,
  que se actualiza cada 15 s y muestra la cuenta de la mesa. Pago **solo en efectivo** con el mesero.
- **La base de datos manda** (`create_table_order`): el teléfono solo envía producto, cantidad, opciones y notas.
  Precios, agotados, opciones obligatorias, horario y pausa se revisan ahí. Una clave por envío evita duplicados.
  Varios teléfonos en la misma mesa suman a una sola cuenta abierta.
- **Panel › Pedidos** (`orders.view`): se actualiza cada 10 s. Aceptar (`orders.accept`) → En preparación / Listo / Entregado
  (`orders.update`, solo hacia adelante). Cancelar (`orders.cancel`) exige motivo. Si dos personas tocan el mismo pedido,
  solo vale el primer cambio (número de versión). Interruptor para pausar pedidos (`settings.edit`).
- **Panel › Mesas** (`tables.manage`): crear y desactivar mesas, ver y descargar su QR, cerrar la cuenta cuando se cobra en
  efectivo. No se cierra si hay pedidos sin entregar o si el total cambió desde que se vio.
- **Panel › Restaurante › Pedidos y horario:** pedidos en mesa sí/no y horario por día (puede cruzar la medianoche).
  **Sin horario no se reciben pedidos** (no se supone ninguno). El horario real de Don Chuleta está pendiente.
- Los QR apuntan a `NEXT_PUBLIC_SITE_URL`: en `localhost` no sirven en un teléfono. Imprimirlos hasta tener el dominio (Fase 8).
- Las alertas con sonido y la pantalla de cocina en tiempo real son de la Fase 5; por ahora el panel se refresca solo.

### Prueba realizada (15-nov-2026)
Horario temporal 00:00–23:59 → "Mesa de prueba" → pedido #1 desde el teléfono (Chuleta con "bien cocida, sin cebollín",
Q 30.00) → el panel lo mostró → Aceptar (la página del cliente cambió sola) → Listo → Entregado → Mesas: "Cobrado en
efectivo · Cerrar cuenta" → el cliente ve "La cuenta de esta mesa ya se cerró". Pausa: el menú de la mesa avisó que
los pedidos están pausados. Al terminar se reanudaron los pedidos y se dejó el horario vacío.
## Pedidos a domicilio (Fase 4B)
- **Decisión del dueño (15-nov-2026):** la entrega es **gratis** y **solo dentro de Malacatancito**, sin mapa ni servicio de
  mapas. El cliente escribe nombre, teléfono (8 dígitos), dirección y referencias, confirma que está dentro de la zona y
  paga **en efectivo al recibir** ("¿Con cuánto vas a pagar?" va en las notas para llevar cambio).
- Se pide desde el menú general `/r/<slug>` → "Tu pedido" → **Pedir a domicilio**. El teléfono guarda los datos del cliente
  solo en ese mismo teléfono para la próxima vez.
- `create_delivery_order` usa el mismo cálculo de precios que la mesa (`app.armar_lineas`) y el mismo horario de atención.
  Contra abusos: máximo 3 pedidos sin terminar por teléfono. Los datos del cliente solo los ve el personal con `orders.view`.
- **Panel › Restaurante › Pedidos y horario:** domicilio sí/no, zona de entrega, costo de envío (vacío = gratis) y pedido
  mínimo (vacío = sin mínimo). Don Chuleta: domicilio activado, "Solo Malacatancito", envío gratis, horario pendiente.
- **Panel › Pedidos:** muestra dirección, referencias y botón para llamar. Botones: Aceptar → En camino → **Entregado y cobrado**
  (al marcarlo se registra el cobro en efectivo).

### Prueba realizada (15-nov-2026)
Domicilio activado + horario temporal → pedido #2 desde el menú general (Hamburguesa Simple, datos ficticios, "Paga con Q 100")
→ sin datos el formulario marcó cada campo → enviado: "Envío Gratis", total Q 35.00 → panel: Aceptar → En camino →
Entregado y cobrado → la página del cliente mostró "Entregado" y el cobro de Q 35.00 quedó registrado. Horario vaciado al final.
## Operación (Fase 5)
- **Aviso en vivo:** el panel se suscribe a `orders` con Supabase Realtime (`src/components/panel/alerta-pedidos.tsx`) usando
  la clave pública y la sesión del empleado: RLS decide qué pedidos recibe. Al llegar uno: sonido (generado en el navegador,
  sin archivos), vibración, letrero "Pedido nuevo #N" y "(N)" en el título. El navegador exige **tocar la pantalla una vez**
  para permitir el sonido (botón "Toca para activar el sonido"). Si se corta la conexión en vivo, la lista se actualiza cada 30 s.
- **Cocina** (`/panel/<slug>/cocina`, `orders.view`): pedidos aceptados y en preparación, letra grande, botones Empezar / Listo
  (`orders.update`). Con un área elegida muestra solo lo de esa área; «Listo» marca el pedido completo.
- **Áreas** (Restaurante › Áreas y avisos): p. ej. Cocina y Barra; cada categoría del menú se asigna a un área
  (clave compuesta: no se puede usar un área de otro restaurante).
- **Encargado:** "Me encargo" / "Soltar" (`assign_order`); nadie más puede tomar un pedido ya tomado; el dueño o el gerente
  pueden liberarlo. Filtros Todos / Míos / Sin encargado.
- **Atrasos:** "Hace X min" y "Atrasado" en rojo según los minutos del restaurante (valores iniciales 5 para aceptar y 25 para
  tenerlo listo; se cambian en el panel). Los nuevos sin aceptar vuelven a sonar cada minuto. Los minutos se calculan con la
  hora del servidor, aunque el reloj del aparato esté mal.
- **Pedidos por WhatsApp (decisión del dueño, 20-nov-2026):** si el restaurante escribe su número en *Restaurante › WhatsApp para pedidos*,
  el cliente arma su pedido en el menú (también desde el QR de su mesa) y toca «Pedir por WhatsApp»: se abre WhatsApp con el pedido
  ya escrito y el cliente lo envía. No se usa la API de WhatsApp y la página no guarda el pedido. Con número, el panel oculta Pedidos,
  Cocina, Informes y los avisos con sonido (siguen guardados); si se borra el número, vuelve el sistema de pedidos del panel.

### Prueba realizada (15-nov-2026)
Panel "En vivo" → pedido de mesa desde otra pestaña: el aviso apareció en **0.83 s** (pedido #3); pedido a domicilio: **1.06 s**
(#4) y el título mostró "(1)". "Me encargo" → "Atiende: Tú". Cocina con área Barra mostró solo las Coronitas del pedido;
Empezar → Listo. Al final se cerraron los pedidos y la cuenta, se borraron las áreas de prueba y se vació el horario.
## Promociones e informes (Fase 6)
- **Promociones** (Panel › Promociones, `menu.edit`): porcentaje o monto fijo, a productos o categorías completas, con fecha y
  hora de inicio y fin (hora de Guatemala), «acumulable» y «activa». El menú muestra el precio tachado y la etiqueta («-20%»).
- **La base de datos cobra** (`app.descuento_unitario` dentro de `app.armar_lineas`): descuento sobre el precio del producto,
  no sobre los extras; nunca deja un precio negativo; con varias promociones se aplica la que más descuenta y solo las acumulables
  se suman (si dan más). Cada línea del pedido guarda su descuento y el nombre de la promoción. El menú usa la misma regla
  (`src/lib/menu/promociones.ts`) solo para mostrar.
- **Combos:** se crean como productos normales (p. ej. «Combo hamburguesa + gaseosa» con la opción «Elige tu bebida»).
- **Destacados:** la casilla «Destacado» del producto lo muestra en «Recomendados», al inicio del menú.
- **Informes** (Panel › Informes, `reports.view`, función `sales_report`): Hoy, Ayer, 7 días, Este mes, 30 días o fechas
  propias. Separa registrados, entregados, cancelados, en curso y **cobrado en efectivo**; ventas, descuentos, ticket promedio,
  mesa vs. domicilio, ventas por día y los 10 más vendidos.

### Prueba realizada (16-nov-2026)
Promoción «Prueba 20%» en Chuleta + Chuleta destacada → el menú mostró «Recomendados» y Q 30.00 tachado → Q 24.00 «-20%»; el carrito
cobró Q 24.00 y la base de datos (consulta de solo lectura) calculó el mismo descuento (Q 6.00). Informes de 30 días en cero (datos de
prueba ya borrados). Al final se borró la promoción y se quitó el destacado. No se crearon pedidos de prueba.
## Seguridad y pruebas (Fase 7)
Informe completo: [`../docs/informe-seguridad-fase-7.md`](../docs/informe-seguridad-fase-7.md). Resumen: 0 hallazgos graves;
corregidos: carrito que se perdía sin internet, política de contenido (CSP) + HTTPS obligatorio, límite de 30 pedidos por
minuto por restaurante y dos funciones internas cerradas. `tests/db/auditoria.test.ts` revisa el catálogo completo de la base
en cada cambio. Lighthouse móvil: 91 / 100 / 100 / 100. Zod se usa desde `src/lib/zod.ts` (sin `eval`, por la CSP) y no se
carga en el menú del cliente.
## Entregar el restaurante a su dueño
La cuenta creada con la invitación de prueba es del desarrollador. Para el dueño real, en el SQL Editor:
```sql
select new_invitation_token('don-chuleta', 'CORREO_DEL_DUEÑO', 'owner');
```
Se le envía `https://<dominio>/acceso/invitacion/<token>`: solo funciona con ese correo, una vez, durante 72 h.
Él crea su propia contraseña (Supabase la guarda cifrada; nadie más la conoce).

## Pruebas automáticas
```
npm test          # todas (no necesitan internet ni claves)
npm run test:db   # solo aislamiento y permisos de la base de datos
npm run test:telefono   # recorrido en tamaño teléfono con Edge (con `npm run dev` corriendo; no crea pedidos)
```
Las pruebas de base de datos usan PostgreSQL en memoria (PGlite) con las mismas migraciones.

## Comandos de administración (requieren `SUPABASE_SECRET_KEY`; alternativa a los SQL de arriba)
| Comando | Para qué |
|---|---|
| `npm run restaurante:crear -- --nombre "..." --slug ... --email ...` | Alta de restaurante (queda pendiente hasta que el dueño acepte) |
| `npm run restaurante:invitar -- --slug ... --email ... [--rol owner\|manager\|staff]` | Nueva invitación (si la anterior venció) |
| `npm run restaurante:estado -- --slug ... --estado active\|suspended` | Suspender o reactivar |
| `npm run carta:cargar -- --slug don-chuleta [--reemplazar]` | Cargar la carta de Don Chuleta |

## Estructura
```
src/app/            páginas: acceso, invitación, panel, r/[slug] (menú del cliente)
src/components/menu vista del menú (portada, buscador, hojas de producto y pedido)
src/lib/            Supabase (servidor / admin / público), validaciones, invitaciones, dinero
src/lib/menu/       armar el menú, carrito, temas, rutas de imagen (sin servidor: se prueban solos)
src/server/         lectura del menú público con caché
src/proxy.ts        renueva la sesión y protege /panel y /empleado
supabase/migrations esquema + seguridad (RLS)
supabase/seed       carta de Don Chuleta
scripts/            comandos de administración
tests/              pruebas (db = aislamiento, unit = validaciones)
```
