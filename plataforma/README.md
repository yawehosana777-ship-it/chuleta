# Plataforma de menús digitales — Fases 1 y 2

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
| Enviar pedidos en línea | ⏳ Fase 4 |
| Administración de menú, fotos, empleados | ⏳ Fase 3 |

## Cómo se puso en marcha (ya hecho en el proyecto `uqwojpsvrfoqsfaldkhj`)

La Fase 1 **no necesita la clave secreta**: todo lo administrativo se ejecuta en
Supabase › **SQL Editor** (rol `postgres`) y la invitación se verifica dentro de la base de datos.

1. **Clave pública:** `.env.local` lleva `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   `SUPABASE_SECRET_KEY` queda vacía hasta la Fase 3. **Nunca compartas la clave secreta.**
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

> Las migraciones se aplicaron a mano, así que la CLI de Supabase no las tiene registradas.
> Antes de usar `supabase db push` en el futuro:
> `npx supabase migration repair --status applied 20261116000100 20261116000200 20261116000300 20261116000400`

## Menú del cliente (Fase 2)
- Dirección: `http://localhost:3000/r/don-chuleta`. Solo se ven restaurantes **activos** y productos/categorías activos.
- Se lee con un cliente **anónimo** (sin sesión), así el dueño ve exactamente lo mismo que un cliente.
- Caché de ~1 minuto: un cambio en la base (precio, agotado, nombre) aparece solo, sin volver a publicar.
  En la Fase 3 el panel invalidará la caché al guardar (`etiquetaMenu` en `src/server/menu-publico.ts`).
- Imágenes: por ahora las de Don Chuleta viven en `public/menus/don-chuleta/`. Las rutas que no empiezan
  con `/` se leen del bucket público `menu` de Supabase Storage (se crea en la Fase 3 para que el dueño suba fotos).
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
