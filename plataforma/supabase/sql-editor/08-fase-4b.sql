-- Fase 4 (parte B) · Pegar completo en Supabase > SQL Editor y ejecutar (Run).
-- Copia de supabase/migrations/20261116000700_pedidos_domicilio.sql

-- =====================================================================
-- Fase 4 (parte B) · Pedidos a domicilio
--   Decisión del dueño: entrega GRATIS y solo dentro de Malacatancito,
--   sin mapa. El cliente escribe nombre, teléfono, dirección y referencias
--   y confirma que está dentro de la zona. Paga en efectivo al recibir.
--   El costo de envío y el pedido mínimo quedan configurables (0 = gratis /
--   sin mínimo) por si otro restaurante de la plataforma los necesita.
--   Mesa y domicilio comparten el mismo cálculo de precios y el mismo
--   horario de atención.
-- =====================================================================

-- Texto de la zona que ve el cliente ("Solo Malacatancito").
alter table public.delivery_settings add column area_note text check (length(area_note) <= 120);

-- ---------- Cálculo de las líneas (compartido por mesa y domicilio) ----------
-- p_items = [{"product_id": uuid, "quantity": 1-20, "options": [uuid...], "notes": "..."}]
-- Precio y disponibilidad SIEMPRE desde la base de datos.
create function app.armar_lineas(p_restaurant uuid, p_items jsonb, out lineas jsonb, out subtotal bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_item     jsonb;
  v_prod     record;
  v_opts     uuid[];
  v_extra    integer;
  v_opc_json jsonb;
  v_qty      integer;
  v_nota     text;
begin
  lineas := '[]'::jsonb;
  subtotal := 0;
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

    select p.id, p.name, p.price_cents into v_prod
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

    subtotal := subtotal + (v_prod.price_cents + v_extra)::bigint * v_qty;
    lineas := lineas || jsonb_build_object(
      'product_id', v_prod.id, 'product_name', v_prod.name, 'unit_price_cents', v_prod.price_cents + v_extra,
      'quantity', v_qty, 'options', v_opc_json, 'notes', v_nota,
      'line_total_cents', (v_prod.price_cents + v_extra) * v_qty);
  end loop;

  if subtotal > 100000000 then raise exception 'invalid_items' using errcode = '22023'; end if;
end $$;

-- Guarda las líneas ya calculadas y el primer evento del pedido.
create function app.guardar_lineas(p_restaurant uuid, p_order uuid, p_lineas jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.order_items (restaurant_id, order_id, product_id, product_name, unit_price_cents,
                                  quantity, options, notes, line_total_cents)
  select p_restaurant, p_order, x.product_id, x.product_name, x.unit_price_cents, x.quantity, x.options, x.notes, x.line_total_cents
  from jsonb_to_recordset(p_lineas) as x(product_id uuid, product_name text, unit_price_cents integer,
                                         quantity smallint, options jsonb, notes text, line_total_cents integer);
  insert into public.order_events (restaurant_id, order_id, from_status, to_status)
  values (p_restaurant, p_order, null, 'nuevo');
$$;

-- ---------- Pedido de mesa: mismo comportamiento, ahora con el cálculo compartido ----------
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

  -- Bloquea el restaurante: numeración y cuenta abierta sin choques.
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
  insert into public.orders (restaurant_id, number, type, table_account_id, subtotal_cents, total_cents,
                             customer_name, notes, idempotency_key)
  values (v_rest.id, v_number, 'dine_in', v_account, v_calc.subtotal, v_calc.subtotal,
          nullif(trim(coalesce(p_customer_name, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), p_idempotency_key)
  returning id, tracking_token into v_order, v_token;
  perform app.guardar_lineas(v_rest.id, v_order, v_calc.lineas);

  return query select v_number, v_token, v_calc.subtotal::integer;
end $$;

-- ---------- Pedido a domicilio ----------
create function public.create_delivery_order(
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
  -- Mismo horario de atención que la mesa.
  if not app.abierto_en(v_rest.id, 'dine_in', now()) then raise exception 'closed' using errcode = 'P0001'; end if;

  -- Teléfono de Guatemala: 8 dígitos (se acepta con +502 delante).
  if v_tel ~ '^502[0-9]{8}$' then v_tel := substr(v_tel, 4); end if;
  if v_tel !~ '^[0-9]{8}$' then raise exception 'invalid_phone' using errcode = '22023'; end if;
  if length(v_nombre) not between 2 and 60 or length(v_dir) not between 5 and 300
     or length(v_ref) > 300 or length(v_notas) > 500 then
    raise exception 'invalid_customer' using errcode = '22023';
  end if;

  -- Contra abusos: pocos pedidos sin terminar por teléfono.
  if (select count(*) from public.orders
      where restaurant_id = v_rest.id and type = 'delivery' and customer_phone = substr(v_tel, 1, 4) || '-' || substr(v_tel, 5)
        and status not in ('entregado', 'cancelado')) >= 3 then
    raise exception 'too_many_orders' using errcode = 'P0001';
  end if;

  select * into v_calc from app.armar_lineas(v_rest.id, p_items);
  if v_calc.subtotal < v_conf.min_order_cents then raise exception 'below_minimum' using errcode = 'P0001'; end if;
  v_envio := coalesce(v_conf.fixed_fee_cents, 0);

  select coalesce(max(number), 0) + 1 into v_number from public.orders where restaurant_id = v_rest.id;
  insert into public.orders (restaurant_id, number, type, subtotal_cents, delivery_fee_cents, total_cents,
                             customer_name, customer_phone, delivery_address, delivery_references, notes, idempotency_key)
  values (v_rest.id, v_number, 'delivery', v_calc.subtotal, v_envio, v_calc.subtotal + v_envio,
          v_nombre, substr(v_tel, 1, 4) || '-' || substr(v_tel, 5), v_dir, v_ref, v_notas, p_idempotency_key)
  returning id, tracking_token into v_order, v_token;
  perform app.guardar_lineas(v_rest.id, v_order, v_calc.lineas);

  return query select v_number, v_token, (v_calc.subtotal + v_envio)::integer;
end $$;

-- ---------- Seguimiento: también muestra si es a domicilio ----------
create or replace function public.order_by_token(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'number', o.number, 'type', o.type, 'status', o.status, 'subtotal_cents', o.subtotal_cents,
    'delivery_fee_cents', o.delivery_fee_cents, 'total_cents', o.total_cents, 'created_at', o.created_at,
    'notes', o.notes, 'address', o.delivery_address, 'references', o.delivery_references,
    'restaurant', r.name, 'slug', r.slug, 'currency', r.currency, 'phone', r.phone, 'table', t.label,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'name', i.product_name, 'quantity', i.quantity, 'options', i.options,
                'notes', i.notes, 'line_total_cents', i.line_total_cents) order by i.product_name), '[]'::jsonb)
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

-- ---------- Estado: al entregar un domicilio queda registrado el cobro en efectivo ----------
create or replace function public.set_order_status(p_order uuid, p_to public.order_status, p_version integer, p_note text default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  v_orden constant public.order_status[] := array['nuevo', 'aceptado', 'en_preparacion', 'listo', 'entregado']::public.order_status[];
  v_permiso public.permission_code;
  v_nota text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into o from public.orders where id = p_order for update;
  if not found or not app.is_member(o.restaurant_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if o.status in ('entregado', 'cancelado') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  elsif p_to = 'cancelado' then
    v_permiso := 'orders.cancel';
    if length(v_nota) is null or length(v_nota) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  elsif o.status = 'nuevo' and p_to = 'aceptado' then
    v_permiso := 'orders.accept';
  elsif o.status <> 'nuevo' and array_position(v_orden, p_to) > array_position(v_orden, o.status) then
    v_permiso := 'orders.update';
  else
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  if not app.has_permission(o.restaurant_id, v_permiso) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if o.version <> p_version then
    raise exception 'order_changed' using errcode = '40001';
  end if;
  if length(v_nota) > 500 then raise exception 'invalid_request' using errcode = '22023'; end if;

  update public.orders
     set status = p_to, version = version + 1,
         accepted_by = case when p_to = 'aceptado' then (select auth.uid()) else accepted_by end
   where id = p_order;
  insert into public.order_events (restaurant_id, order_id, from_status, to_status, actor_user_id, note)
  values (o.restaurant_id, o.id, o.status, p_to, (select auth.uid()), v_nota);

  -- Domicilio: se paga en efectivo al recibir, así que "entregado" = cobrado.
  if o.type = 'delivery' and p_to = 'entregado' and o.total_cents > 0 then
    insert into public.cash_payments (restaurant_id, order_id, amount_cents, received_by)
    values (o.restaurant_id, o.id, o.total_cents, (select auth.uid()));
  end if;
  return o.version + 1;
end $$;

-- ---------- Privilegios ----------
revoke all on function app.armar_lineas(uuid, jsonb), app.guardar_lineas(uuid, uuid, jsonb),
                       public.create_delivery_order(text, jsonb, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_delivery_order(text, jsonb, text, text, text, text, text, text)
  to anon, authenticated;
