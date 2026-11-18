# Guía de publicación (Fase 8)

Pasos para poner la plataforma en internet. Las cuentas, pagos y contraseñas los maneja siempre el dueño de la
plataforma; las claves se pegan directamente en Netlify, nunca en un chat ni en el código.

## 1. Código en GitHub (repositorio privado)
1. En GitHub: **New repository** → nombre (por ejemplo `menus-digitales`) → **Private** → sin README ni .gitignore.
2. Conectar y subir (en la carpeta del proyecto):
   ```
   git remote add origin https://github.com/<usuario>/<repositorio>.git
   git push -u origin main
   ```
   La primera vez, Windows abre el navegador para iniciar sesión en GitHub.
3. Lo que NO se sube (ya está en `.gitignore`): `.env.local` (claves), `node_modules`, `.next`, resultados de pruebas.

## 2. Sitio en Netlify
1. Netlify → **Add new project → Import an existing project → GitHub** → elegir el repositorio.
2. Netlify lee `netlify.toml`: carpeta `plataforma`, comando `npm run build`, Node 24. No hay que cambiar nada.
3. **Antes de publicar**, en *Site configuration → Environment variables*, agregar:

   | Variable | Valor | ¿Secreta? |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://uqwojpsvrfoqsfaldkhj.supabase.co` | No |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clave pública de Supabase (`sb_publishable_…`) | No |
   | `NEXT_PUBLIC_SITE_URL` | la dirección final, p. ej. `https://<sitio>.netlify.app` o el dominio | No |
   | `SUPABASE_SECRET_KEY` | clave secreta de Supabase (`sb_secret_…`) — copiarla en Supabase y pegarla aquí | **Sí** (marcar "Contains secret values") |

   Las `NEXT_PUBLIC_*` se incrustan al construir: si se cambian, hay que volver a publicar (*Deploys → Trigger deploy*).
4. **Deploy**. Cada cambio que llegue a `main` se publica solo.

## 3. Dirección (dominio)
- Gratis e inmediato: `https://<nombre>.netlify.app` (se puede cambiar el nombre en *Domain management*).
- Dominio propio (~US$10–15/año): comprarlo y en Netlify *Domain management → Add a domain*; Netlify da el
  certificado HTTPS gratis. Después, actualizar `NEXT_PUBLIC_SITE_URL` y volver a publicar.
- **Los QR de las mesas usan `NEXT_PUBLIC_SITE_URL`.** Imprimirlos solo cuando la dirección sea la definitiva:
  si cambia el dominio, los QR impresos dejan de servir.

## 4. Supabase en producción
1. *Authentication → URL Configuration*: **Site URL** = la dirección final; en **Redirect URLs** agregar
   `https://<dirección>/**`.
2. Plan: el gratuito pausa el proyecto tras una semana sin uso y no ofrece copias restaurables desde el panel.
   Para operar con clientes reales se recomienda **Pro (~US$25/mes)**: copias diarias y sin pausas.
3. **Probar la restauración** (obligatorio antes de dar por terminada la Fase 8): con el plan Pro,
   *Database → Backups* → restaurar una copia en un proyecto de prueba y revisar que el menú y los pedidos estén.

## 5. Monitoreo de errores
- Netlify → *Logs → Functions*: errores del servidor (pedidos, panel).
- Supabase → *Logs*: errores de base de datos y de inicio de sesión.
- Revisar ambos el primer día de operación y cuando alguien reporte un problema.

## 6. Prueba final en la dirección real
1. Abrir `https://<dirección>/r/don-chuleta` en un teléfono: menú, fotos, carrito.
2. Panel: iniciar sesión, ver "En vivo", activar el sonido.
3. Con horario temporal: pedido de mesa (QR real) y a domicilio → aceptar → entregar → cerrar cuenta.
4. Varios teléfonos pidiendo a la vez en la misma mesa → una sola cuenta, sin pedidos duplicados.
5. Borrar los pedidos de prueba (SQL Editor) y dejar el horario real del restaurante.
