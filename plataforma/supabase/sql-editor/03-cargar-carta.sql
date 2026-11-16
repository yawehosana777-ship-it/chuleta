-- Carta de Don Chuleta. GENERADO por scripts/generar-sql-carta.mts; no editar a mano.
-- Pegar en Supabase › SQL Editor y ejecutar DESPUÉS de crear el restaurante.
do $$
declare rid uuid; cid uuid; pid uuid; gid uuid;
begin
  select id into rid from public.restaurants where slug = 'don-chuleta';
  if rid is null then
    raise exception 'Primero crea el restaurante don-chuleta';
  end if;
  if exists (select 1 from public.categories where restaurant_id = rid) then
    raise exception 'Don Chuleta ya tiene carta cargada';
  end if;

  insert into public.categories (restaurant_id, name, description, position)
    values (rid, 'Nuestras Carnes', 'Acompañados de frijoles volteados, papa asada, cebollín y 3 tortillas.', 0) returning id into cid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Chuleta', 3000, 0) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Costilla en Barbacoa', 3000, 1) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Pechuga', 3000, 2) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Viuda', 3500, 3) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Chorizo', 2500, 4) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Pollo Asado', 2500, 5) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Churrasquito', 2300, 6) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Puyazo Nacional', 4000, 7) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Puyazo Importado', 6000, 8) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Arrachera', 6000, 9) returning id into pid;
  insert into public.categories (restaurant_id, name, description, position)
    values (rid, 'Hamburguesas', 'Cualquier hamburguesa es acompañada de papas fritas.', 1) returning id into cid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Hamburguesa Simple', 3500, 0) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Hamburguesa en Barbacoa', 3500, 1) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Hamburguesa con Huevo', 4000, 2) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Cheese Burger', 5500, 3) returning id into pid;
  insert into public.categories (restaurant_id, name, description, position)
    values (rid, 'Para Disfrutar', null, 2) returning id into cid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Alitas Buffalo', null, 0) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Alitas en Barbacoa', null, 1) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Alitas Teriyaki', null, 2) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Alitas Mango Habanero', null, 3) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Alitas de Mostaza', null, 4) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Tacos de Birria', null, 5) returning id into pid;
  insert into public.categories (restaurant_id, name, description, position)
    values (rid, 'Postres', null, 3) returning id into cid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Pastel de Zanahoria', 1600, 0) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Pastel de Queso Fresa', 1600, 1) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Pastel de Tres Leches', 1600, 2) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Pastel de Chocolate', 1600, 3) returning id into pid;
  insert into public.categories (restaurant_id, name, description, position)
    values (rid, 'Cervezas', null, 4) returning id into cid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Coronitas', 700, 0) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Corona', 1200, 1) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Gallo', 1200, 2) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Cabro Extra', 1200, 3) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Monte Carlo', 1700, 4) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Cabro Reserva', 1700, 5) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Cimarrona', 1500, 6) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Michelada de Gallo o Corona', 2000, 7) returning id into pid;
  insert into public.option_groups (restaurant_id, product_id, name, min_select, max_select)
    values (rid, pid, 'Elige tu cerveza', 1, 1) returning id into gid;
  insert into public.options (restaurant_id, group_id, name, position) values
    (rid, gid, 'Gallo', 0),
    (rid, gid, 'Corona', 1);
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Michelada de Cabro o Monte Carlo', 2500, 8) returning id into pid;
  insert into public.option_groups (restaurant_id, product_id, name, min_select, max_select)
    values (rid, pid, 'Elige tu cerveza', 1, 1) returning id into gid;
  insert into public.options (restaurant_id, group_id, name, position) values
    (rid, gid, 'Cabro', 0),
    (rid, gid, 'Monte Carlo', 1);
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Mineral Preparada', 1700, 9) returning id into pid;
  insert into public.categories (restaurant_id, name, description, position)
    values (rid, 'Bebidas Frías', null, 5) returning id into cid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Gaseosas', 800, 0) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Té Frío', 800, 1) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Refrescos Naturales', 800, 2) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Frappé Oreo', 2200, 3) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Frappé Capuchino', 2200, 4) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Frappé Mocaccino', 2200, 5) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Frappé Piña Colada', 2200, 6) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Frappé Cookies and Cream', 2200, 7) returning id into pid;
  insert into public.categories (restaurant_id, name, description, position)
    values (rid, 'Bebidas Calientes', null, 6) returning id into cid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Café', 700, 0) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Café con Leche', 1000, 1) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Té de Manzanilla', 800, 2) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Capuchino', 1200, 3) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Chocolate', 1000, 4) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Chocolate con Leche', 1300, 5) returning id into pid;
  insert into public.categories (restaurant_id, name, description, position)
    values (rid, 'Tequila', null, 7) returning id into cid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Shot de Rancho Escondido', 1000, 0) returning id into pid;
  insert into public.products (restaurant_id, category_id, name, price_cents, position)
    values (rid, cid, 'Shot de Gran Malo', 2500, 1) returning id into pid;
end $$;

select c.name as categoria, count(p.id) as productos
from public.categories c
left join public.products p on p.category_id = c.id
join public.restaurants r on r.id = c.restaurant_id and r.slug = 'don-chuleta'
group by c.name, c.position order by c.position;
