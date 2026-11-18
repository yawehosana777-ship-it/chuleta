# Informe de seguridad y pruebas — Fase 7

Fecha: 18-nov-2026 · Plataforma de menús digitales (primer cliente: Don Chuleta)

## Resumen

**Hallazgos graves: 0.** Se encontraron y corrigieron 4 hallazgos menores o medios. Todas las pruebas pasan:
169 automáticas (base de datos y aplicación) y 7 de recorrido en tamaño teléfono.

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| 1 | Si se cortaba el internet al tocar «Enviar pedido», salía una página de error y el cliente perdía su carrito. Igual con los botones del panel. | Media | Corregido: mensaje claro, el carrito se conserva y reintentar no duplica el pedido. |
| 2 | Sin política de contenido (CSP) ni HTTPS obligatorio en las cabeceras. | Media | Corregido: CSP (solo recursos propios y de Supabase, sin incrustar la página en otras) y HSTS. |
| 3 | Sin límite general contra pedidos falsos en ráfaga. | Media | Corregido: máximo 30 pedidos por minuto por restaurante (además de 40 por cuenta de mesa y 3 abiertos por teléfono). |
| 4 | Dos funciones internas (registro de cambios y validación de rutas de fotos) estaban disponibles para el público. Sin riesgo real. | Baja | Corregido: cerradas. |

## Qué se revisó

**Base de datos (prueba automática `tests/db/auditoria.test.ts`, se repite en cada cambio):**
- Todas las tablas tienen RLS activado; el público no puede escribir en ninguna.
- Pedidos, cobros, cuentas, membresías, invitaciones y auditoría solo se escriben mediante funciones revisadas.
- El personal nunca puede cambiar el slug ni el estado del restaurante.
- Toda función con privilegios fija su `search_path`.
- El público solo puede usar las funciones de cliente previstas (mesa, pedir, seguimiento, invitación).
- Las funciones de administración solo las usa el servidor.
- Las fotos solo se suben/cambian/borran con permiso de menú en la carpeta del propio restaurante.

**Aplicación:**
- Cada acción del panel obtiene el restaurante de la sesión y filtra por él; la base de datos lo vuelve a exigir.
- Inicio de sesión: mensaje genérico (no revela si un correo o usuario existe), manejo de «demasiados intentos»
  (límite de Supabase Auth) y redirección solo a rutas internas.
- Contraseñas: las guarda Supabase cifradas; nunca en texto plano.
- Claves: ninguna clave secreta llega al navegador (revisado en la versión de producción; solo la clave pública).
- Paquetes: 0 fallas conocidas (se actualizaron herramientas de revisión de código con un arreglo seguro).
- Precios y descuentos: siempre los calcula la base de datos; el teléfono solo dice qué y cuánto.
- Concurrencia: doble toque = un solo pedido (clave por envío); dos empleados no pueden cambiar el mismo pedido
  (número de versión); numeración y cuenta de mesa protegidas con bloqueo de fila.

**Pruebas en teléfono (`e2e/telefono.e2e.ts`, con el Edge instalado, sin crear pedidos):** menú sin desplazamiento
lateral y con cabeceras de seguridad; búsqueda sin acentos; carrito; producto sin precio no se puede pedir;
formulario de domicilio marca cada campo; enlaces inventados dan «no encontrado»; panel sin sesión pide iniciar
sesión; acceso de empleado con usuario inventado da mensaje genérico.

## Velocidad (Lighthouse, teléfono, versión de producción)

| | Fase 2 | Fase 7 (3 mediciones) |
|---|---|---|
| Rendimiento | 89–90 | **91 / 91 / 91** |
| Accesibilidad | 100 | 100 |
| Buenas prácticas | 100 | 100 |
| SEO | 100 | 100 |

Mejora: el menú del cliente dejó de cargar la librería de validación (de 253 KB a 163 KB de código).

## Limitaciones conocidas (sin riesgo de seguridad)

- La prueba de «muchos pedidos al mismo tiempo» se razonó y se cubre con bloqueos en la base de datos, pero no se
  simuló con tráfico real: se haría sobre la copia de producción en la Fase 8 para no ensuciar los datos.
- `'unsafe-inline'` en la política de scripts lo exige Next.js para sus scripts iniciales.
- Restablecer la contraseña de un empleado sigue necesitando la clave secreta en el servidor (Fase 8, en Netlify).
