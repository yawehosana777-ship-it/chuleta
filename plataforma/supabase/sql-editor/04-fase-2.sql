-- Cambios de la Fase 2. Ejecutar UNA vez en Supabase > SQL Editor (si ya corriste 01-crear-tablas.sql antes de la Fase 2).
-- Copia de supabase/migrations/20261116000400_presentacion_menu.sql.

-- =====================================================================
-- Fase 2 Â· PresentaciÃ³n del menÃº del cliente
--   * Ãcono y foto de portada por categorÃ­a.
--   * Las rutas de imagen solo admiten caracteres seguros: o bien un
--     archivo de la aplicaciÃ³n (/menus/...) o una ruta dentro del bucket
--     pÃºblico de Storage (se habilita en la Fase 3).
-- =====================================================================

create function app.ruta_imagen_valida(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p is null
      or (length(p) <= 300 and p ~ '^/?[A-Za-z0-9][A-Za-z0-9._/-]*\.(png|jpe?g|webp|avif)$' and p !~ '\.\.');
$$;
grant execute on function app.ruta_imagen_valida(text) to anon, authenticated;

alter table public.categories
  add column icon text not null default 'plato'
    check (icon in ('plato', 'carne', 'hamburguesa', 'alitas', 'postre', 'cerveza', 'fria', 'caliente', 'tequila')),
  add column image_path text check (app.ruta_imagen_valida(image_path));

alter table public.restaurants
  add constraint restaurants_logo_path_valida check (app.ruta_imagen_valida(logo_path)),
  add constraint restaurants_cover_path_valida check (app.ruta_imagen_valida(cover_path));

alter table public.product_images
  add constraint product_images_path_valida check (app.ruta_imagen_valida(storage_path));
