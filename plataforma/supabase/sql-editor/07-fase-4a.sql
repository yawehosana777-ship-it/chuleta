-- Fase 4 (parte A) · Pegar completo en Supabase > SQL Editor y ejecutar (Run).
-- Copia de supabase/migrations/20261116000600_pedidos_mesa.sql

-- =====================================================================
-- Fase 4 (parte A) · Pedidos de mesa
--   1. Horario por servicio. Sin horario configurado = cerrado (nunca se
--      supone un horario que el restaurante no dio).
--   2. El cliente pide escaneando el QR de su mesa. La función
--      create_table_order recalcula TODO con los precios de la base: lo
--      que mande el teléfono solo dice QUÉ quiere y CUÁNTO, nunca el precio.
--      Una clave por envío evita duplicados si se toca dos veces.
--   3. Varios teléfonos en la misma mesa suman a una sola cuenta abierta.
--   4. El personal cambia el estado según sus permisos; el número de versión
--      evita que dos personas cambien el mismo pedido a la vez.
--   5. Cerrar la cuenta registra el cobro en efectivo (único medio de pago).
-- =====================================================================

-- ---------- 1. Horario ----------
-- ¿El servicio atiende en el momento indicado (hora local del restaurante)?
-- Un horario que cruza la medianoche (18:00–02:00) se guarda con
-- opens_at > closes_at y cuenta también para la madrugada del día siguiente.
create function app.abierto_en(p_restaurant uuid, p_service public.service_kind, p_momento timestamptz)
returns boolean
language sql stable security definer set search_path = '' as $$
  with local as (
    select (p_momento at time zone r.timezone) as t from public.restaurants r where r.id = p_restaurant
  )
  select exists (
    select 1 from public.opening_hours h, local
    where h.restaurant_id = p_restaurant and h.service = p_service
      and (
        (h.opens_at < h.closes_at and h.weekday = extract(dow from local.t)
           and local.t::time >= h.opens_at and local.t::time < h.closes_at)
        or (h.opens_at > h.closes_at and h.weekday = extract(dow from local.t)
           and local.t::time >= h.opens_at)
        or (h.opens_at > h.closes_at and h.weekday = (extract(dow from local.t)::int + 6) % 7
           and local.t::time < h.closes_at)
      )
  );
$$;

-- Reemplaza el horario de un servicio. p_hours = [{"weekday":0-6,"opens":"HH:MM","closes":"HH:MM"}]
create function public.set_opening_hours(p_restaurant uuid, p_service public.service_kind, p_hours jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.has_permission(p_restaurant, 'settings.edit') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) > 14 or exists (
    select 1 from jsonb_array_elements(p_hours) h
    where jsonb_typeof(h) <> 'object'
       or coalesce(h->>'weekday', '') !~ '^[0-6]$'
       or coalesce(h->>'opens', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
       or coalesce(h->>'closes', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
       or h->>'opens' = h->>'closes'
  ) then
    raise exception 'invalid_hours' using errcode = '22023';
  end if;

  delete from public.opening_hours where restaurant_id = p_restaurant and service = p_service;
  insert into public.opening_hours (restaurant_id, service, weekday, opens_at, closes_at)
  select p_restaurant, p_service, (h->>'weekday')::smallint, (h->>'opens')::time, (h->>'closes')::time
  from jsonb_array_elements(p_hours) h;
end $$;

-- ---------- 2. Mesa del código QR ----------
-- estado: abierto | cerrado | pausado | sin_servicio
create function public.table_by_qr(p_code text)
returns table (slug text, label text, estado text)
language sql stable security definer set search_path = '' as $$
  select r.slug, t.label,
         case when not r.dine_in_enabled then 'sin_servicio'
              when r.orders_paused then 'pausado'
              when not app.abierto_en(r.id, 'dine_in', now()) then 'cerrado'
              else 'abierto' end
  from public.tables t
  join public.restaurants r on r.id = t.restaurant_id
  where p_code ~ '^[0-9a-f]{24}$' and t.qr_code = p_code and t.active and r.status = 'active';
$$;

-- ---------- 3. Crear un pedido de mesa ----------
-- p_items = [{"product_id": uuid, "quantity": 1-20, "options": [uuid...], "notes": "..."}]
create function public.create_table_order(
  p_qr_code text, p_items jsonb, p_customer_name text, p_notes text, p_idempotency_key text
) returns table (order_number integer, tracking_token text, total_cents integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_table    public.tables;
  v_rest     public.restaurants;
  v_previo   public.orders;
  v_item     jsonb;
  v_prod     record;
  v_opts     uuid[];
  v_extra    integer;
  v_opc_json jsonb;
  v_qty      integer;
  v_nota     text;
  v_lineas   jsonb := '[]'::jsonb;
  v_subtotal bigint := 0;
  v_account  uuid;
  v_number   integer;
  v_order    uuid;
  v_token    text;
begin
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,100}$' then
    raise exception 'invalid_request' using errcode = '22023';
  end if;

  select * into v_table from public.tables where p_qr_code ~ '^[0-9a-f]{24}$' and qr_code = p_qr_code and active;
  if not found then raise exception 'table_not_found' using errcode = 'P0002'; end if;

  -- Bloquea el restaurante: así la numeración de pedidos y la cuenta abierta
  -- no se pisan si dos teléfonos envían al mismo tiempo.
  select * into v_rest from public.restaurants where id = v_table.restaurant_id for update;

  -- El mismo envío repetido (doble toque, red lenta) devuelve el pedido ya creado.
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

    -- Precio y disponibilidad SIEMPRE desde la base de datos.
    select p.id, p.name, p.price_cents into v_prod
    from public.products p
    join public.categories c on c.id = p.category_id
    where p.id = app.uuid_o_nulo(v_item->>'product_id') and p.restaurant_id = v_rest.id
      and p.active and c.active and not p.sold_out and p.price_cents is not null;
    if not found then raise exception 'product_unavailable' using errcode = 'P0001'; end if;

    v_opts := array(select distinct app.uuid_o_nulo(x) from jsonb_array_elements_text(coalesce(v_item->'options', '[]'::jsonb)) x);
    -- Cada opción debe existir, estar activa y ser de este producto.
    if exists (
      select 1 from unnest(v_opts) o
      where o is null or not exists (
        select 1 from public.options op join public.option_groups g on g.id = op.group_id
        where op.id = o and op.active and g.product_id = v_prod.id
      )
    ) then
      raise exception 'invalid_options' using errcode = 'P0001';
    end if;
    -- Cada grupo respeta su mínimo y su máximo.
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

    v_subtotal := v_subtotal + (v_prod.price_cents + v_extra)::bigint * v_qty;
    v_lineas := v_lineas || jsonb_build_object(
      'product_id', v_prod.id, 'product_name', v_prod.name, 'unit_price_cents', v_prod.price_cents + v_extra,
      'quantity', v_qty, 'options', v_opc_json, 'notes', v_nota,
      'line_total_cents', (v_prod.price_cents + v_extra) * v_qty);
  end loop;

  if v_subtotal > 100000000 then raise exception 'invalid_items' using errcode = '22023'; end if;

  -- Cuenta abierta de la mesa (se crea con el primer pedido).
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
  values (v_rest.id, v_number, 'dine_in', v_account, v_subtotal, v_subtotal,
          nullif(trim(coalesce(p_customer_name, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), p_idempotency_key)
  returning id, tracking_token into v_order, v_token;

  insert into public.order_items (restaurant_id, order_id, product_id, product_name, unit_price_cents,
                                  quantity, options, notes, line_total_cents)
  select v_rest.id, v_order, x.product_id, x.product_name, x.unit_price_cents, x.quantity, x.options, x.notes, x.line_total_cents
  from jsonb_to_recordset(v_lineas) as x(product_id uuid, product_name text, unit_price_cents integer,
                                         quantity smallint, options jsonb, notes text, line_total_cents integer);

  insert into public.order_events (restaurant_id, order_id, from_status, to_status)
  values (v_rest.id, v_order, null, 'nuevo');

  return query select v_number, v_token, v_subtotal::integer;
end $$;

-- ---------- Seguimiento para el cliente (solo con el código secreto del pedido) ----------
create function public.order_by_token(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'number', o.number, 'status', o.status, 'total_cents', o.total_cents, 'created_at', o.created_at,
    'notes', o.notes, 'restaurant', r.name, 'slug', r.slug, 'currency', r.currency, 'table', t.label,
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

-- ---------- 4. Estado del pedido (personal) ----------
-- nuevo → aceptado (orders.accept) → en_preparacion / listo / entregado (orders.update, solo hacia adelante).
-- Cualquier pedido no terminado → cancelado (orders.cancel, con motivo).
create function public.set_order_status(p_order uuid, p_to public.order_status, p_version integer, p_note text default null)
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
  -- Otra persona lo cambió mientras tanto: hay que volver a mirar el pedido.
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
  return o.version + 1;
end $$;

-- ---------- 5. Cerrar la cuenta de la mesa (cobro en efectivo) ----------
-- p_total_cents es el total que vio el empleado: si cambió (llegó otro
-- pedido), no se cierra y debe volver a revisar.
create function public.close_table_account(p_account uuid, p_total_cents integer) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.table_accounts; v_total integer;
begin
  select * into a from public.table_accounts where id = p_account for update;
  if not found or not app.has_permission(a.restaurant_id, 'tables.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if a.status = 'closed' then raise exception 'account_closed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.orders where table_account_id = a.id and status not in ('entregado', 'cancelado')) then
    raise exception 'account_has_pending_orders' using errcode = 'P0001';
  end if;
  select coalesce(sum(total_cents), 0) into v_total from public.orders
  where table_account_id = a.id and status <> 'cancelado';
  if v_total <> p_total_cents then raise exception 'total_changed' using errcode = '40001'; end if;

  update public.table_accounts set status = 'closed', closed_at = now(), closed_by = (select auth.uid()) where id = a.id;
  if v_total > 0 then
    insert into public.cash_payments (restaurant_id, table_account_id, amount_cents, received_by)
    values (a.restaurant_id, a.id, v_total, (select auth.uid()));
  end if;
end $$;

-- ---------- Privilegios ----------
revoke all on function app.abierto_en(uuid, public.service_kind, timestamptz),
                       public.set_opening_hours(uuid, public.service_kind, jsonb),
                       public.table_by_qr(text),
                       public.create_table_order(text, jsonb, text, text, text),
                       public.order_by_token(text),
                       public.set_order_status(uuid, public.order_status, integer, text),
                       public.close_table_account(uuid, integer)
  from public, anon, authenticated;
-- El cliente (sin cuenta) solo puede: ver su mesa, pedir y seguir su pedido.
grant execute on function public.table_by_qr(text),
                          public.create_table_order(text, jsonb, text, text, text),
                          public.order_by_token(text)
  to anon, authenticated;
grant execute on function public.set_opening_hours(uuid, public.service_kind, jsonb),
                          public.set_order_status(uuid, public.order_status, integer, text),
                          public.close_table_account(uuid, integer)
  to authenticated;
