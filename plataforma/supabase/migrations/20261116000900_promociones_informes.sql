-- =====================================================================
-- Fase 6 · Promociones e informes
--   1. Promociones por porcentaje o monto fijo, a productos o categorías,
--      con fecha y hora de inicio/fin. La BASE DE DATOS calcula el
--      descuento al crear el pedido (el teléfono no manda precios ni
--      descuentos). Reglas:
--        * El descuento se aplica al precio del producto (no a los extras).
--        * Nunca deja un precio negativo (máximo = precio del producto).
--        * Varias promociones: se aplica la que más descuenta; solo las
--          marcadas "acumulable" se suman entre sí (y se usa la suma solo
--          si da más que la mejor sola).
--   2. Cada línea del pedido guarda su descuento y el nombre de la promoción.
--   3. Informe de ventas (reports.view): registrados, entregados,
--      cancelados y cobrados por separado; ventas por día; más vendidos.
--   Los combos se arman como productos normales con sus opciones.
-- =====================================================================

-- ---------- Descuento guardado en cada línea ----------
alter table public.order_items
  add column discount_cents integer not null default 0 check (discount_cents >= 0),
  add column promotion text check (length(promotion) <= 300),
  add constraint order_items_total_cuadra check (line_total_cents = unit_price_cents * quantity - discount_cents);

-- ---------- Descuento por unidad de un producto en un momento ----------
create function app.descuento_unitario(p_restaurant uuid, p_product uuid, p_category uuid, p_base integer, p_momento timestamptz,
                                       out descuento integer, out nombres text)
language sql stable security definer set search_path = '' as $$
  with vigentes as (
    select pr.name, pr.stackable,
           case pr.kind when 'percent' then (p_base * pr.value + 50) / 100 else least(pr.value, p_base) end as d
    from public.promotions pr
    where pr.restaurant_id = p_restaurant and pr.active and pr.kind in ('percent', 'fixed') and pr.value > 0
      and (pr.starts_at is null or pr.starts_at <= p_momento)
      and (pr.ends_at is null or pr.ends_at > p_momento)
      and exists (select 1 from public.promotion_items i
                  where i.promotion_id = pr.id and (i.product_id = p_product or i.category_id = p_category))
  ),
  mejor as (select name, d from vigentes order by d desc, name limit 1),
  acumulables as (select coalesce(sum(d), 0) as s, string_agg(name, ' + ' order by name) as n from vigentes where stackable)
  select least(p_base, greatest(coalesce((select d from mejor), 0), (select s from acumulables)))::integer,
         case when (select s from acumulables) > coalesce((select d from mejor), 0) then (select n from acumulables)
              else (select name from mejor) end;
$$;

-- ---------- Cálculo de líneas: ahora con descuento ----------
drop function app.armar_lineas(uuid, jsonb);
create function app.armar_lineas(p_restaurant uuid, p_items jsonb, out lineas jsonb, out subtotal bigint, out descuento bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_item     jsonb;
  v_prod     record;
  v_desc     record;
  v_opts     uuid[];
  v_extra    integer;
  v_opc_json jsonb;
  v_qty      integer;
  v_nota     text;
begin
  lineas := '[]'::jsonb;
  subtotal := 0;
  descuento := 0;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item->>'quantity', '') !~ '^[0-9]{1,2}$'
       or jsonb_typeof(coalesce(v_item->'options', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(v_item->'options', '[]'::jsonb)) > 20 then
      raise exception 'invalid_items' using errcode = '22023';
    end if;
    v_qty := (v_item->>'quantity')::integer;
    v_nota := nullif(trim(coalesce(v_item->>'notes', '')), '');
    if v_qty not between 1 and 20 or length(v_nota) > 200 then
      raise exception 'invalid_items' using errcode = '22023';
    end if;

    select p.id, p.name, p.price_cents, p.category_id into v_prod
    from public.products p
    join public.categories c on c.id = p.category_id
    where p.id = app.uuid_o_nulo(v_item->>'product_id') and p.restaurant_id = p_restaurant
      and p.active and c.active and not p.sold_out and p.price_cents is not null;
    if not found then raise exception 'product_unavailable' using errcode = 'P0001'; end if;

    v_opts := array(select distinct app.uuid_o_nulo(x) from jsonb_array_elements_text(coalesce(v_item->'options', '[]'::jsonb)) x);
    if exists (
      select 1 from unnest(v_opts) o
      where o is null or not exists (
        select 1 from public.options op join public.option_groups g on g.id = op.group_id
        where op.id = o and op.active and g.product_id = v_prod.id
      )
    ) then
      raise exception 'invalid_options' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.option_groups g
      where g.product_id = v_prod.id
        and (select count(*) from public.options op where op.group_id = g.id and op.id = any (v_opts))
            not between g.min_select and g.max_select
    ) then
      raise exception 'invalid_options' using errcode = 'P0001';
    end if;

    select coalesce(sum(op.price_delta_cents), 0),
           coalesce(jsonb_agg(jsonb_build_object('name', op.name, 'price_delta_cents', op.price_delta_cents)
                              order by g.position, op.position), '[]'::jsonb)
      into v_extra, v_opc_json
    from public.options op join public.option_groups g on g.id = op.group_id
    where op.id = any (v_opts);

    select * into v_desc from app.descuento_unitario(p_restaurant, v_prod.id, v_prod.category_id, v_prod.price_cents, now());

    subtotal := subtotal + (v_prod.price_cents + v_extra)::bigint * v_qty;
    descuento := descuento + v_desc.descuento::bigint * v_qty;
    lineas := lineas || jsonb_build_object(
      'product_id', v_prod.id, 'product_name', v_prod.name, 'unit_price_cents', v_prod.price_cents + v_extra,
      'quantity', v_qty, 'options', v_opc_json, 'notes', v_nota,
      'discount_cents', v_desc.descuento * v_qty, 'promotion', case when v_desc.descuento > 0 then v_desc.nombres end,
      'line_total_cents', (v_prod.price_cents + v_extra - v_desc.descuento) * v_qty);
  end loop;

  if subtotal > 100000000 then raise exception 'invalid_items' using errcode = '22023'; end if;
end $$;

create or replace function app.guardar_lineas(p_restaurant uuid, p_order uuid, p_lineas jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.order_items (restaurant_id, order_id, product_id, product_name, unit_price_cents,
                                  quantity, options, notes, discount_cents, promotion, line_total_cents)
  select p_restaurant, p_order, x.product_id, x.product_name, x.unit_price_cents, x.quantity, x.options, x.notes,
         x.discount_cents, x.promotion, x.line_total_cents
  from jsonb_to_recordset(p_lineas) as x(product_id uuid, product_name text, unit_price_cents integer, quantity smallint,
                                         options jsonb, notes text, discount_cents integer, promotion text, line_total_cents integer);
  insert into public.order_events (restaurant_id, order_id, from_status, to_status)
  values (p_restaurant, p_order, null, 'nuevo');
$$;

-- ---------- Pedido de mesa con descuento ----------
create or replace function public.create_table_order(
  p_qr_code text, p_items jsonb, p_customer_name text, p_notes text, p_idempotency_key text
) returns table (order_number integer, tracking_token text, total_cents integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_table   public.tables;
  v_rest    public.restaurants;
  v_previo  public.orders;
  v_calc    record;
  v_account uuid;
  v_number  integer;
  v_order   uuid;
  v_token   text;
begin
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,100}$' then
    raise exception 'invalid_request' using errcode = '22023';
  end if;

  select * into v_table from public.tables where p_qr_code ~ '^[0-9a-f]{24}$' and qr_code = p_qr_code and active;
  if not found then raise exception 'table_not_found' using errcode = 'P0002'; end if;

  select * into v_rest from public.restaurants where id = v_table.restaurant_id for update;

  select * into v_previo from public.orders o
  where o.restaurant_id = v_rest.id and o.idempotency_key = p_idempotency_key;
  if found then
    return query select v_previo.number, v_previo.tracking_token, v_previo.total_cents;
    return;
  end if;

  if v_rest.status <> 'active' then raise exception 'restaurant_unavailable' using errcode = 'P0001'; end if;
  if not v_rest.dine_in_enabled then raise exception 'dine_in_disabled' using errcode = 'P0001'; end if;
  if v_rest.orders_paused then raise exception 'orders_paused' using errcode = 'P0001'; end if;
  if not app.abierto_en(v_rest.id, 'dine_in', now()) then raise exception 'closed' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_customer_name, ''))) > 60 or length(trim(coalesce(p_notes, ''))) > 500 then
    raise exception 'invalid_request' using errcode = '22023';
  end if;

  select * into v_calc from app.armar_lineas(v_rest.id, p_items);

  select id into v_account from public.table_accounts where table_id = v_table.id and status = 'open';
  if not found then
    insert into public.table_accounts (restaurant_id, table_id) values (v_rest.id, v_table.id) returning id into v_account;
  end if;
  if (select count(*) from public.orders where table_account_id = v_account) >= 40 then
    raise exception 'too_many_orders' using errcode = 'P0001';
  end if;

  select coalesce(max(number), 0) + 1 into v_number from public.orders where restaurant_id = v_rest.id;
  insert into public.orders (restaurant_id, number, type, table_account_id, subtotal_cents, discount_cents, total_cents,
                             customer_name, notes, idempotency_key)
  values (v_rest.id, v_number, 'dine_in', v_account, v_calc.subtotal, v_calc.descuento, v_calc.subtotal - v_calc.descuento,
          nullif(trim(coalesce(p_customer_name, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), p_idempotency_key)
  returning id, tracking_token into v_order, v_token;
  perform app.guardar_lineas(v_rest.id, v_order, v_calc.lineas);

  return query select v_number, v_token, (v_calc.subtotal - v_calc.descuento)::integer;
end $$;

-- ---------- Pedido a domicilio con descuento ----------
create or replace function public.create_delivery_order(
  p_slug text, p_items jsonb, p_customer_name text, p_phone text, p_address text,
  p_references text, p_notes text, p_idempotency_key text
) returns table (order_number integer, tracking_token text, total_cents integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_rest    public.restaurants;
  v_conf    public.delivery_settings;
  v_previo  public.orders;
  v_calc    record;
  v_tel     text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_nombre  text := trim(coalesce(p_customer_name, ''));
  v_dir     text := trim(coalesce(p_address, ''));
  v_ref     text := nullif(trim(coalesce(p_references, '')), '');
  v_notas   text := nullif(trim(coalesce(p_notes, '')), '');
  v_envio   integer;
  v_number  integer;
  v_order   uuid;
  v_token   text;
begin
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,100}$' then
    raise exception 'invalid_request' using errcode = '22023';
  end if;

  select * into v_rest from public.restaurants
  where p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and slug = p_slug and status = 'active' for update;
  if not found then raise exception 'restaurant_unavailable' using errcode = 'P0002'; end if;

  select * into v_previo from public.orders o
  where o.restaurant_id = v_rest.id and o.idempotency_key = p_idempotency_key;
  if found then
    return query select v_previo.number, v_previo.tracking_token, v_previo.total_cents;
    return;
  end if;

  select * into v_conf from public.delivery_settings where restaurant_id = v_rest.id;
  if not v_rest.delivery_enabled or not found or v_conf.method <> 'fixed' then
    raise exception 'delivery_disabled' using errcode = 'P0001';
  end if;
  if v_rest.orders_paused then raise exception 'orders_paused' using errcode = 'P0001'; end if;
  if not app.abierto_en(v_rest.id, 'dine_in', now()) then raise exception 'closed' using errcode = 'P0001'; end if;

  if v_tel ~ '^502[0-9]{8}$' then v_tel := substr(v_tel, 4); end if;
  if v_tel !~ '^[0-9]{8}$' then raise exception 'invalid_phone' using errcode = '22023'; end if;
  if length(v_nombre) not between 2 and 60 or length(v_dir) not between 5 and 300
     or length(v_ref) > 300 or length(v_notas) > 500 then
    raise exception 'invalid_customer' using errcode = '22023';
  end if;

  if (select count(*) from public.orders
      where restaurant_id = v_rest.id and type = 'delivery' and customer_phone = substr(v_tel, 1, 4) || '-' || substr(v_tel, 5)
        and status not in ('entregado', 'cancelado')) >= 3 then
    raise exception 'too_many_orders' using errcode = 'P0001';
  end if;

  select * into v_calc from app.armar_lineas(v_rest.id, p_items);
  -- El mínimo se compara con lo que realmente paga el cliente (ya con descuento).
  if v_calc.subtotal - v_calc.descuento < v_conf.min_order_cents then raise exception 'below_minimum' using errcode = 'P0001'; end if;
  v_envio := coalesce(v_conf.fixed_fee_cents, 0);

  select coalesce(max(number), 0) + 1 into v_number from public.orders where restaurant_id = v_rest.id;
  insert into public.orders (restaurant_id, number, type, subtotal_cents, discount_cents, delivery_fee_cents, total_cents,
                             customer_name, customer_phone, delivery_address, delivery_references, notes, idempotency_key)
  values (v_rest.id, v_number, 'delivery', v_calc.subtotal, v_calc.descuento, v_envio, v_calc.subtotal - v_calc.descuento + v_envio,
          v_nombre, substr(v_tel, 1, 4) || '-' || substr(v_tel, 5), v_dir, v_ref, v_notas, p_idempotency_key)
  returning id, tracking_token into v_order, v_token;
  perform app.guardar_lineas(v_rest.id, v_order, v_calc.lineas);

  return query select v_number, v_token, (v_calc.subtotal - v_calc.descuento + v_envio)::integer;
end $$;

-- ---------- Seguimiento: incluye descuentos ----------
create or replace function public.order_by_token(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'number', o.number, 'type', o.type, 'status', o.status, 'subtotal_cents', o.subtotal_cents,
    'discount_cents', o.discount_cents, 'delivery_fee_cents', o.delivery_fee_cents, 'total_cents', o.total_cents,
    'created_at', o.created_at, 'notes', o.notes, 'address', o.delivery_address, 'references', o.delivery_references,
    'restaurant', r.name, 'slug', r.slug, 'currency', r.currency, 'phone', r.phone, 'table', t.label,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'name', i.product_name, 'quantity', i.quantity, 'options', i.options, 'notes', i.notes,
                'discount_cents', i.discount_cents, 'promotion', i.promotion, 'line_total_cents', i.line_total_cents)
                order by i.product_name), '[]'::jsonb)
              from public.order_items i where i.order_id = o.id),
    'account', case when a.id is null then null else jsonb_build_object(
      'open', a.status = 'open',
      'total_cents', (select coalesce(sum(x.total_cents), 0) from public.orders x
                      where x.table_account_id = a.id and x.status <> 'cancelado'),
      'orders', (select jsonb_agg(jsonb_build_object('number', x.number, 'status', x.status, 'total_cents', x.total_cents)
                                  order by x.number)
                 from public.orders x where x.table_account_id = a.id)) end)
  from public.orders o
  join public.restaurants r on r.id = o.restaurant_id
  left join public.table_accounts a on a.id = o.table_account_id
  left join public.tables t on t.id = a.table_id
  where p_token ~ '^[0-9a-f]{32}$' and o.tracking_token = p_token;
$$;

-- ---------- Guardar una promoción (panel) ----------
-- Fechas en hora LOCAL del restaurante ("2026-11-20T18:00"); vacías = sin límite.
create function public.save_promotion(
  p_restaurant uuid, p_id uuid, p_name text, p_kind public.promotion_kind, p_value integer,
  p_starts text, p_ends text, p_stackable boolean, p_active boolean, p_products uuid[], p_categories uuid[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tz     text := (select timezone from public.restaurants where id = p_restaurant);
  v_inicio timestamptz;
  v_fin    timestamptz;
  v_id     uuid := p_id;
  v_nombre text := trim(coalesce(p_name, ''));
begin
  if not app.has_permission(p_restaurant, 'menu.edit') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_kind not in ('percent', 'fixed') or length(v_nombre) not between 1 and 120
     or p_value is null or (p_kind = 'percent' and p_value not between 1 and 100)
     or (p_kind = 'fixed' and p_value not between 1 and 10000000) then
    raise exception 'invalid_promotion' using errcode = '22023';
  end if;
  if coalesce(p_starts, '') !~ '^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$' or coalesce(p_ends, '') !~ '^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$' then
    raise exception 'invalid_dates' using errcode = '22023';
  end if;
  v_inicio := case when coalesce(p_starts, '') = '' then null else (replace(p_starts, 'T', ' ')::timestamp at time zone v_tz) end;
  v_fin    := case when coalesce(p_ends, '') = '' then null else (replace(p_ends, 'T', ' ')::timestamp at time zone v_tz) end;
  if v_inicio is not null and v_fin is not null and v_fin <= v_inicio then
    raise exception 'invalid_dates' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_products), 0) + coalesce(cardinality(p_categories), 0) = 0 then
    raise exception 'promotion_without_items' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.promotions (restaurant_id, name, kind, value, starts_at, ends_at, stackable, active)
    values (p_restaurant, v_nombre, p_kind, p_value, v_inicio, v_fin, coalesce(p_stackable, false), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.promotions
       set name = v_nombre, kind = p_kind, value = p_value, starts_at = v_inicio, ends_at = v_fin,
           stackable = coalesce(p_stackable, false), active = coalesce(p_active, true)
     where id = v_id and restaurant_id = p_restaurant;
    if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
    delete from public.promotion_items where promotion_id = v_id;
  end if;

  -- Claves compuestas: un producto o categoría de otro restaurante hace fallar todo.
  insert into public.promotion_items (restaurant_id, promotion_id, product_id)
  select p_restaurant, v_id, x from unnest(coalesce(p_products, '{}')) x;
  insert into public.promotion_items (restaurant_id, promotion_id, category_id)
  select p_restaurant, v_id, x from unnest(coalesce(p_categories, '{}')) x;
  return v_id;
end $$;

-- ---------- Informe de ventas ----------
-- Fechas locales del restaurante, ambas incluidas (máximo un año).
create function public.sales_report(p_restaurant uuid, p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz  text;
  v_ini timestamptz;
  v_fin timestamptz;
  v_res jsonb;
begin
  if not app.has_permission(p_restaurant, 'reports.view') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 366 then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  select timezone into v_tz from public.restaurants where id = p_restaurant;
  v_ini := p_desde::timestamp at time zone v_tz;
  v_fin := (p_hasta + 1)::timestamp at time zone v_tz;

  with pedidos as (
    select * from public.orders where restaurant_id = p_restaurant and created_at >= v_ini and created_at < v_fin
  ), cobros as (
    select * from public.cash_payments where restaurant_id = p_restaurant and confirmed_at >= v_ini and confirmed_at < v_fin
  )
  select jsonb_build_object(
    'registrados', (select count(*) from pedidos),
    'entregados', (select count(*) from pedidos where status = 'entregado'),
    'cancelados', (select count(*) from pedidos where status = 'cancelado'),
    'en_curso', (select count(*) from pedidos where status not in ('entregado', 'cancelado')),
    'ventas_cents', (select coalesce(sum(total_cents), 0) from pedidos where status = 'entregado'),
    'descuentos_cents', (select coalesce(sum(discount_cents), 0) from pedidos where status = 'entregado'),
    'cancelado_cents', (select coalesce(sum(total_cents), 0) from pedidos where status = 'cancelado'),
    'cobrado_cents', (select coalesce(sum(amount_cents), 0) from cobros),
    'por_tipo', (select coalesce(jsonb_object_agg(type, jsonb_build_object('pedidos', n, 'ventas_cents', v)), '{}'::jsonb)
                 from (select type, count(*) n, sum(total_cents) v from pedidos where status = 'entregado' group by type) t),
    'por_dia', (select coalesce(jsonb_agg(d order by d->>'dia'), '[]'::jsonb) from (
                  select jsonb_build_object(
                    'dia', dia,
                    'registrados', count(*) filter (where p.id is not null),
                    'entregados', count(*) filter (where p.status = 'entregado'),
                    'cancelados', count(*) filter (where p.status = 'cancelado'),
                    'ventas_cents', coalesce(sum(p.total_cents) filter (where p.status = 'entregado'), 0),
                    'cobrado_cents', (select coalesce(sum(c.amount_cents), 0) from cobros c
                                      where (c.confirmed_at at time zone v_tz)::date = dia)) as d
                  from generate_series(p_desde, p_hasta, interval '1 day') g(dia_ts)
                  cross join lateral (select g.dia_ts::date as dia) x
                  left join pedidos p on (p.created_at at time zone v_tz)::date = x.dia
                  group by dia) dias),
    'mas_vendidos', (select coalesce(jsonb_agg(m order by (m->>'cantidad')::int desc, m->>'nombre'), '[]'::jsonb) from (
                       select jsonb_build_object('nombre', i.product_name, 'cantidad', sum(i.quantity), 'ventas_cents', sum(i.line_total_cents)) as m
                       from public.order_items i join pedidos p on p.id = i.order_id
                       where p.status = 'entregado'
                       group by i.product_name
                       order by sum(i.quantity) desc, i.product_name
                       limit 10) top)
  ) into v_res;
  return v_res;
end $$;

-- ---------- Privilegios ----------
revoke all on function app.descuento_unitario(uuid, uuid, uuid, integer, timestamptz), app.armar_lineas(uuid, jsonb),
                       public.save_promotion(uuid, uuid, text, public.promotion_kind, integer, text, text, boolean, boolean, uuid[], uuid[]),
                       public.sales_report(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.save_promotion(uuid, uuid, text, public.promotion_kind, integer, text, text, boolean, boolean, uuid[], uuid[]),
                          public.sales_report(uuid, date, date)
  to authenticated;
