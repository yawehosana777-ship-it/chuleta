-- Presentación del menú de Don Chuleta (logo, portada, tema, íconos y fotos).
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 04-fase-2.sql. Se puede repetir.
-- Datos tomados del rótulo y la carta del restaurante; nada inventado.
do $$
declare rid uuid;
begin
  select id into rid from public.restaurants where slug = 'don-chuleta';
  if rid is null then
    raise exception 'Primero crea el restaurante don-chuleta';
  end if;

  update public.restaurants set
    address    = 'Km 248, Malacatancito',
    logo_path  = '/menus/don-chuleta/logo.png',
    cover_path = '/menus/don-chuleta/rotulo.jpg',
    theme      = jsonb_build_object(
      'plantilla', 'parrilla',
      'lema', 'Al gusto de nuestros clientes',
      'etiquetas', jsonb_build_array('Carnes', 'Hamburguesas', 'Cervezas', 'Postres'))
  where id = rid;

  update public.categories c set icon = v.icon, image_path = v.foto
  from (values
    ('Nuestras Carnes',   'carne',       null),
    ('Hamburguesas',      'hamburguesa', '/menus/don-chuleta/foto-hamburguesa.png'),
    ('Para Disfrutar',    'alitas',      null),
    ('Postres',           'postre',      '/menus/don-chuleta/foto-pastel.png'),
    ('Cervezas',          'cerveza',     null),
    ('Bebidas Frías',     'fria',        null),
    ('Bebidas Calientes', 'caliente',    null),
    ('Tequila',           'tequila',     '/menus/don-chuleta/foto-tequila.png')
  ) as v(nombre, icon, foto)
  where c.restaurant_id = rid and c.name = v.nombre;

  update public.categories set description = 'Precios pendientes de confirmar con el restaurante.'
  where restaurant_id = rid and name = 'Para Disfrutar' and description is null;
end $$;

select name as categoria, icon as icono, image_path as foto, description as nota
from public.categories
where restaurant_id = (select id from public.restaurants where slug = 'don-chuleta')
order by position;
