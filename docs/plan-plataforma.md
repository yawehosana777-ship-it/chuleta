# Plataforma de menús digitales multi-restaurante — Plan técnico

> Estado: **Fases 1 a 5 aprobadas (15-nov-2026). Fase 5 sin WhatsApp (decisión del dueño). Fase 6 (promociones, destacados e informes) terminada y probada, pendiente de aprobación.** Fase 4: A = pedidos de mesa; B = domicilio gratis solo en Malacatancito, sin mapa (decisión del dueño, 15-nov-2026).** Fase 2 (menú del cliente en `/r/don-chuleta` leyendo Supabase; un cambio de precio en la base apareció solo en ~1 minuto).
> Lighthouse móvil (versión de producción en localhost): Accesibilidad 100, Buenas prácticas 100, SEO 100; Rendimiento 89–90 en modo simulado y 91–92 con limitación real de red/CPU. Ver `plataforma/README.md`.
> La demo de Don Chuleta se conserva sin cambios en `demo/` como referencia visual.

### Decisiones confirmadas (16-nov-2026)
- **Alojamiento:** Netlify (en lugar de Vercel) + Supabase.
- **Direcciones:** `tudominio.com/r/<restaurante>`.
- **Empleados:** inician sesión con **usuario + contraseña**, sin correo. Si olvidan la contraseña, el dueño genera una temporal y el empleado debe cambiarla al entrar. Internamente, cada usuario se guarda en Supabase Auth con un identificador interno que no es un correo real. El dueño sí usa correo, para poder recuperar su cuenta.
- **Demo:** movida a `demo/`.

---

## 1. Tecnologías propuestas

| Pieza | Elección | Por qué |
|---|---|---|
| Lenguaje | **TypeScript** | Detecta errores antes de ejecutar; un solo lenguaje en frontend y backend. |
| Aplicación web | **Next.js (App Router) + React** | Una sola aplicación sirve el menú del cliente, el panel del dueño y la pantalla de empleados. El código del servidor (precios, pedidos) vive junto al de la interfaz, pero **nunca se envía al navegador**. |
| Estilos | **Tailwind CSS** + componentes propios | Rápido de mantener; los colores de cada restaurante se aplican como variables CSS (plantillas). |
| Base de datos | **PostgreSQL** (en **Supabase**) | Relacional, transaccional y con **Row Level Security (RLS)**: la propia base de datos impide que un restaurante vea datos de otro, aunque el código tenga un error. |
| Autenticación | **Supabase Auth** | Contraseñas cifradas (nunca en texto plano), restablecimiento seguro, sesiones con tokens. |
| Fotografías | **Supabase Storage** | Carpetas separadas por restaurante, con permisos y transformación de tamaño. |
| Tiempo real | **Supabase Realtime** | El panel recibe pedidos nuevos al instante (alerta sonora y visual) sin recargar. |
| Validación | **Zod** | Cada dato que llega del navegador se valida en el servidor. |
| Pruebas | **Vitest** (cálculos), **pgTAP/SQL** (aislamiento y permisos), **Playwright** (flujos en teléfono) | Cubre precios, seguridad y uso real. |
| Alojamiento | **Netlify** (app) + **Supabase** (datos) | Sin servidores que mantener, HTTPS automático, publica desde GitHub en cada cambio; Next.js funciona en Netlify con su adaptador oficial. Copias de seguridad diarias en Supabase Pro. |
| WhatsApp (Fase 5) | **WhatsApp Business Platform – Cloud API** (oficial de Meta) | Única vía autorizada. Requiere cuenta de Meta Business, número dedicado y plantillas aprobadas; Meta cobra por mensaje de plantilla según país. Se evaluará en detalle en la Fase 5. |
| Distancia (descartada) | API de rutas (Google Routes u OpenRouteService) a partir de un **pin en el mapa** que marca el cliente | Las direcciones en Guatemala suelen ser imprecisas; el pin da coordenadas verificables. Nunca se inventa una distancia: si el cálculo falla, el pedido no se confirma con envío por distancia. |

**Costos aproximados** (verificar precios vigentes antes de contratar):
- Desarrollo: gratis (planes gratuitos de Supabase y Netlify).
- Producción: Netlify tiene plan gratuito con límites de uso; revisar en la Fase 8 si el tráfico de varios restaurantes exige el plan Pro. Supabase Pro (~US$25/mes) para copias diarias y que el proyecto no se pause por inactividad.
- Dominio: ~US$10–15/año.
- WhatsApp y API de mapas: pago por uso, solo si se activan.

### Alternativa considerada
Servidor propio (VPS) con Postgres y autenticación propia: más control y costo fijo, pero tendrías que administrar actualizaciones, seguridad del servidor y copias de seguridad tú mismo. No la recomiendo para empezar.

---

## 2. Arquitectura general

```
 Teléfono del cliente ──(QR o enlace)──┐
 Panel del dueño (teléfono/PC) ────────┼──► Next.js ───────────► Supabase
 Pantalla de empleados ────────────────┘    · páginas              · PostgreSQL + RLS
                                            · lógica de servidor   · Auth
                                              (precios, pedidos,   · Storage (fotos)
                                               envío, descuentos)  · Realtime (alertas)
                                                     │
                                                     └──► WhatsApp Cloud API (opcional, Fase 5)
```

### Estrategia multi-restaurante (aislamiento)
1. **Toda tabla con datos de un restaurante tiene `restaurant_id`.**
2. **Membresías**: la tabla `memberships` dice qué usuario pertenece a qué restaurante y con qué rol. El servidor obtiene el restaurante del usuario **desde su sesión y su membresía**, nunca de un dato enviado por el navegador.
3. **RLS en cada tabla**: una política del tipo "solo puedes leer/modificar filas cuyo `restaurant_id` esté en tus membresías activas". Si un error de código intentara leer otro restaurante, la base de datos devuelve cero filas.
4. **Clientes sin cuenta**: el menú público solo puede leer productos activos de restaurantes activos. Los pedidos se crean mediante una **función transaccional en la base de datos** (`create_order`) que recalcula precios, descuentos y envío; los precios que mande el navegador se ignoran.
5. **Clave de servicio** (acceso total) solo existe en el servidor, en variables de entorno; jamás en el frontend.

### Direcciones web
- Menú: `tudominio.com/r/don-chuleta`
- Mesa: `tudominio.com/r/don-chuleta/m/<código-de-mesa>` (el código del QR es aleatorio, no "mesa-1", para que no se pueda adivinar)
- Seguimiento: `tudominio.com/pedido/<token-aleatorio>`
- Panel: `tudominio.com/panel` · Empleados: `tudominio.com/empleado`

Los cambios del dueño se leen de la base de datos en cada visita, así que **el mismo enlace y el mismo QR siempre muestran el menú actualizado**.

### Alta segura de restaurantes (sin panel de superadministrador)
1. Tú (dueño de la plataforma) ejecutas un comando protegido: `npm run restaurante:crear -- --nombre "Don Chuleta" --slug don-chuleta --email dueño@...`
2. Se crea el restaurante en estado **pendiente** y una **invitación de un solo uso** que vence en 72 h.
3. El dueño abre el enlace, crea su contraseña y el restaurante pasa a **activo**.
4. Para suspender un restaurante: `npm run restaurante:estado -- --slug ... --estado suspendido`.

---

## 3. Estructura de carpetas

```
meno don chuleta/
├─ demo/                     ← demo actual (index.html, assets, servidor.ps1), sin cambios
├─ docs/                     ← este plan y guías
└─ plataforma/
   ├─ src/
   │  ├─ app/
   │  │  ├─ r/[slug]/            menú del cliente, carrito, mesa (m/[codigo])
   │  │  ├─ pedido/[token]/      seguimiento del pedido
   │  │  ├─ panel/               panel del dueño (menú, pedidos, mesas, empleados, ajustes, estadísticas)
   │  │  ├─ empleado/            pantalla de empleados
   │  │  ├─ acceso/              iniciar sesión, invitación, restablecer contraseña
   │  │  └─ api/                 rutas del servidor (pedidos, webhooks)
   │  ├─ components/             ui/ (botones, hojas, tarjetas) · menu/ · panel/
   │  ├─ server/                 lógica de negocio: pedidos, precios, envío, promociones, permisos
   │  ├─ lib/                    clientes de Supabase, validaciones (zod), formato de quetzales
   │  └─ styles/                 plantillas visuales y variables de tema
   ├─ supabase/
   │  ├─ migrations/             SQL versionado: tablas, índices, RLS, funciones
   │  ├─ seed/                   datos de prueba (incluye la carta real de Don Chuleta)
   │  └─ tests/                  pruebas SQL de aislamiento y permisos
   ├─ scripts/                   alta de restaurantes, copias de seguridad
   ├─ tests/                     unitarias (vitest) y de flujo en teléfono (playwright)
   ├─ .env.example               lista de variables SIN valores secretos
   └─ README.md                  cómo instalar, ejecutar y probar
```

---

## 4. Diseño inicial de la base de datos

Convenciones: claves `uuid`; **dinero en centavos enteros** (`Q 30.00` = `3000`) para evitar errores de redondeo; fechas `timestamptz`; zona horaria por restaurante (`America/Guatemala`).

### Restaurante y acceso
| Tabla | Campos clave | Reglas importantes |
|---|---|---|
| `restaurants` | slug, name, status (pending/active/suspended), timezone, currency, logo/cover, theme (json), contacto, whatsapp, dirección, `orders_paused`, `delivery_enabled` | `slug` único |
| `opening_hours` | restaurant_id, weekday, opens_at, closes_at, service (dine_in/delivery) | se usa para rechazar pedidos fuera de horario |
| `profiles` | user_id (= usuario de Auth), username, full_name, phone, must_change_password | 1 a 1 con el usuario; `username` único dentro de cada restaurante |
| `memberships` | restaurant_id, user_id, role (owner/manager/staff), area_id, active | único (restaurant_id, user_id); al desactivar, pierde acceso de inmediato |
| `membership_permissions` | membership_id, permission (orders.accept, orders.update, menu.edit, …) | permisos finos además del rol |
| `invitations` | restaurant_id, email, role, token_hash, expires_at, used_at | se guarda solo el *hash* del token; un solo uso |
| `areas` | restaurant_id, name (cocina, barra, turno noche…) | para distribución de pedidos |

### Menú
| Tabla | Campos clave | Reglas |
|---|---|---|
| `categories` | restaurant_id, name, position, active | |
| `products` | restaurant_id, category_id, name, description, price_cents, active, sold_out, featured, position | `price_cents >= 0`; la categoría debe ser del mismo restaurante |
| `product_images` | restaurant_id, product_id, storage_path, position | |
| `option_groups` | restaurant_id, product_id, name, min_select, max_select | ej. "Elige tu cerveza" (mín 1, máx 1) |
| `options` | restaurant_id, group_id, name, price_delta_cents, active | ej. "Corona", +Q 0 |
| `promotions` | restaurant_id, kind (percent/fixed/combo/featured), value, starts_at, ends_at, active, priority, stackable | descuento nunca deja un precio negativo; por defecto **no combinables** |
| `promotion_items` | promotion_id, product_id / category_id, quantity | productos incluidos en la promo o combo |

### Mesas y cuentas
| Tabla | Campos clave | Reglas |
|---|---|---|
| `tables` | restaurant_id, label, qr_code (aleatorio), active | `qr_code` único |
| `table_accounts` | restaurant_id, table_id, status (open/closed), opened_at, closed_at, closed_by | **una sola cuenta abierta por mesa** (índice único parcial); cerrar exige confirmación y queda en historial |

### Pedidos
| Tabla | Campos clave | Reglas |
|---|---|---|
| `orders` | restaurant_id, number (correlativo por restaurante), type (dine_in/delivery), table_account_id, status, subtotal/discount/delivery_fee/total (centavos), customer_name, phone, address, references, lat/lng, notes, tracking_token, idempotency_key, assigned_to, version | único (restaurant_id, idempotency_key) → **evita pedidos duplicados** si el cliente toca dos veces; `version` → evita que dos empleados lo modifiquen a la vez |
| `order_items` | restaurant_id, order_id, product_id, **name y precio copiados al momento del pedido**, quantity, options (json), notes, line_total | el historial no cambia si luego editas el producto |
| `order_events` | restaurant_id, order_id, from_status, to_status, actor_user_id, note, created_at | registro de cada cambio de estado y quién lo hizo |
| `cash_payments` | restaurant_id, order_id o table_account_id, amount, received_by, confirmed_at | separa "pedido entregado" de "pago confirmado" en los informes |

### Entregas, avisos y auditoría
| Tabla | Campos clave |
|---|---|
| `delivery_settings` | restaurant_id, method (fixed/zone/distance), fixed_fee, min_order, base_fee, per_km_fee, max_km, origin lat/lng |
| `delivery_zones` | restaurant_id, name, fee, active |
| `notifications` | restaurant_id, order_id, channel (sound/visual/whatsapp), status (queued/sent/failed), attempts, error |
| `audit_log` | restaurant_id, actor_user_id, action, entity, entity_id, before, after, created_at |

**Estados del pedido:** `nuevo → aceptado → en_preparacion → listo → entregado`, y `cancelado` desde cualquier estado previo a entregado (con motivo obligatorio). Las transiciones permitidas se validan en la base de datos. **Ningún pedido pasa a cocina sin que un empleado lo acepte.**

**Concurrencia:** aceptar un pedido es una actualización condicional (`… where status = 'nuevo' and version = X`). Si otro empleado ya lo aceptó, el segundo recibe "Este pedido ya fue tomado por Ana".

---

## 5. Fases y cómo comprobar cada una

| Fase | Qué se construye | Criterios para darla por terminada |
|---|---|---|
| **1. Arquitectura y preparación** | Proyecto Next.js, proyecto Supabase de desarrollo, migraciones con todas las tablas base y RLS, inicio de sesión, alta de restaurantes por invitación, carga de la carta real de Don Chuleta | `npm run dev` abre la app; el dueño invitado crea su contraseña e inicia sesión; **prueba automática**: un usuario del restaurante A no puede leer ni modificar nada del B; el menú público solo muestra productos activos |
| **2. Diseño visual** | Menú móvil real leyendo la base de datos (portando el diseño de la demo), componentes reutilizables, plantillas de tema | Cambiar un precio en la base de datos se refleja en el menú sin redeploy; Lighthouse móvil ≥ 90 en rendimiento y accesibilidad |
| **3. Administración** | Panel: restaurante, categorías, productos, fotos, agotados, empleados y permisos | El dueño gestiona todo desde el teléfono; un empleado sin permiso recibe "no autorizado" desde el servidor |
| **4. Pedidos** | Carrito, observaciones, pedido de mesa, cuenta compartida, domicilio con cálculo de envío, horarios, pausa, seguimiento | Totales calculados en el servidor coinciden con pruebas; doble toque no duplica; fuera de horario se rechaza; la cuenta de mesa acumula pedidos de varios teléfonos |
| **5. Operación** | Pantalla de empleados, alertas sonoras y visuales en tiempo real, asignación (todos / encargado / áreas), alertas de atraso, WhatsApp oficial (si se aprueba) | Pedido nuevo suena en el panel en < 3 s; dos empleados no pueden aceptar el mismo pedido; si WhatsApp falla, el pedido sigue registrado |
| **6. Funciones comerciales** | Promociones, combos, descuentos con fechas, destacados, estadísticas, personalización visual | Descuentos nunca negativos ni combinados indebidamente (pruebas); informes separan registrados/entregados/cancelados/pagados |
| **7. Seguridad y pruebas** | Batería completa: permisos, aislamiento, concurrencia, cálculos, errores, móvil | Todas las pruebas pasan; revisión de seguridad sin hallazgos críticos |
| **8. Publicación** | Dominio, producción, copias de seguridad y restauración probada, monitoreo de errores, guía para nuevos restaurantes | Don Chuleta operando en el dominio real; restauración de copia probada |

---

## 6. Requisitos en tu computadora (Fase 1)

Hoy la PC no tiene Git ni Node.js. Se instalan con `winget` (incluido en Windows):

```
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
```

Y necesitas crear tú mismo (con tu correo y contraseña) cuentas gratuitas en **GitHub**, **Supabase** y **Netlify**. Yo nunca escribo contraseñas ni claves por ti; tú pegas las claves en el archivo `.env.local`, que no se sube a internet.

No se necesita Docker: desarrollaremos contra un proyecto de Supabase "desarrollo" en la nube, separado del de "producción".
