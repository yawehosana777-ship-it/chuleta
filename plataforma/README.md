# Plataforma de menús digitales — Fase 1

Aplicación Next.js + Supabase. Plan completo en [`../docs/plan-plataforma.md`](../docs/plan-plataforma.md).

## Qué funciona en la Fase 1

| Función | Estado |
|---|---|
| Base de datos completa (restaurantes, menú, mesas, pedidos, entregas, avisos, auditoría) | ✅ Migraciones listas |
| Aislamiento entre restaurantes (RLS) | ✅ 23 pruebas automáticas |
| Alta de restaurante + invitación de un solo uso | ✅ Script `restaurante:crear` |
| Dueño crea su cuenta desde la invitación | ✅ `/acceso/invitacion/<token>` |
| Inicio y cierre de sesión | ✅ `/acceso` |
| Panel básico (muestra los restaurantes del usuario) | ✅ `/panel` |
| Carta real de Don Chuleta cargada en la base | ✅ Script `carta:cargar` |
| Menú del cliente conectado a la base | ⏳ Fase 2 |
| Administración de menú, empleados, pedidos | ⏳ Fases 3–5 |

## Cómo ponerla en marcha (una sola vez)

Abre una terminal **en la carpeta `plataforma`**.

### 1. Pega tus claves
Abre `.env.local` (con el Bloc de notas) y pega después del `=`:
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → Supabase › Project Settings › API Keys › **Publishable key** › botón copiar.
- `SUPABASE_SECRET_KEY` → misma página › **Secret keys** › botón copiar.

Guarda el archivo. **Nunca compartas la clave secreta.**

### 2. Crea las tablas en Supabase
```
npx supabase login
npm run db:vincular
npm run db:aplicar
```
- `login` abre el navegador para autorizar.
- `db:vincular` te pide la **contraseña de la base de datos** (la que guardaste al crear el proyecto).
- `db:aplicar` crea todas las tablas y reglas de seguridad. Responde `Y` cuando pregunte.

### 3. Da de alta a Don Chuleta
```
npm run restaurante:crear -- --nombre "Don Chuleta" --slug don-chuleta --email CORREO_DEL_DUEÑO
npm run carta:cargar -- --slug don-chuleta
```
El primer comando imprime un **enlace de invitación** (vence en 72 h, un solo uso).

### 4. Prueba
```
npm run dev
```
1. Abre el enlace de invitación en el navegador → crea la contraseña → entras al panel y ves "Don Chuleta · Dueño · Activo".
2. Cierra sesión y vuelve a entrar en `http://localhost:3000/acceso`.
3. Intenta abrir el enlace de invitación otra vez → debe decir "ya fue utilizada".

## Pruebas automáticas
```
npm test          # todas (no necesitan internet ni claves)
npm run test:db   # solo aislamiento y permisos de la base de datos
```
Las pruebas de base de datos usan PostgreSQL en memoria (PGlite) con las mismas migraciones.

## Comandos de administración
| Comando | Para qué |
|---|---|
| `npm run restaurante:crear -- --nombre "..." --slug ... --email ...` | Alta de restaurante (queda pendiente hasta que el dueño acepte) |
| `npm run restaurante:invitar -- --slug ... --email ... [--rol owner\|manager\|staff]` | Nueva invitación (si la anterior venció) |
| `npm run restaurante:estado -- --slug ... --estado active\|suspended` | Suspender o reactivar |
| `npm run carta:cargar -- --slug don-chuleta [--reemplazar]` | Cargar la carta de Don Chuleta |

## Estructura
```
src/app/            páginas: acceso, invitación, panel
src/lib/            Supabase (servidor / admin), validaciones, invitaciones
src/proxy.ts        renueva la sesión y protege /panel y /empleado
supabase/migrations esquema + seguridad (RLS)
supabase/seed       carta de Don Chuleta
scripts/            comandos de administración
tests/              pruebas (db = aislamiento, unit = validaciones)
```
