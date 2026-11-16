-- =====================================================================
-- Fase 5 · Operación
--   1. Tiempo real: los cambios de "orders" se avisan al panel al instante
--      (Supabase Realtime). Cada empleado solo recibe los pedidos que su
--      RLS le deja ver (orders.view en SU restaurante).
--   2. Áreas de preparación (Cocina, Barra…): cada categoría del menú
--      puede ir a un área; la pantalla de cocina filtra por área.
--   3. Encargado: un empleado puede "tomar" un pedido; nadie más puede
--      tomarlo mientras tanto.
--   4. Avisos de atraso: minutos configurables por restaurante.
--   WhatsApp oficial NO se incluye: requiere aprobación del dueño.
-- =====================================================================

-- ---------- 1. Tiempo real ----------
-- (La publicación existe en Supabase; en las pruebas locales no.)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- ---------- 2. Áreas de preparación ----------
alter table public.categories add column area_id uuid;
-- Clave compuesta: una categoría solo puede ir a un área de SU restaurante.
alter table public.categories add constraint categories_area_fk
  foreign key (restaurant_id, area_id) references public.areas (restaurant_id, id) on delete set null (area_id);

-- ---------- 3. Encargado ----------
-- p_tomar = true: "Me encargo" (si nadie lo tiene). false: soltarlo
-- (quien lo tiene, o el dueño / gerente).
create function public.assign_order(p_order uuid, p_tomar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or not (app.has_permission(o.restaurant_id, 'orders.accept') or app.has_permission(o.restaurant_id, 'orders.update')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if o.status in ('entregado', 'cancelado') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;

  if p_tomar then
    if o.assigned_to is not null and o.assigned_to <> (select auth.uid()) then
      raise exception 'already_assigned' using errcode = 'P0001';
    end if;
    update public.orders set assigned_to = (select auth.uid()) where id = o.id;
  else
    if o.assigned_to is distinct from (select auth.uid()) and app.rol_de(o.restaurant_id) not in ('owner', 'manager') then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
    update public.orders set assigned_to = null where id = o.id;
  end if;
end $$;

-- Nombres del equipo, para mostrar quién atiende cada pedido
-- (los perfiles completos siguen protegidos).
create function public.team_names(p_restaurant uuid) returns table (user_id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, p.full_name
  from public.memberships m join public.profiles p on p.user_id = m.user_id
  where m.restaurant_id = p_restaurant and app.is_member(p_restaurant);
$$;

-- ---------- 4. Avisos de atraso ----------
alter table public.restaurants
  add column alert_accept_minutes smallint not null default 5 check (alert_accept_minutes between 1 and 120),
  add column alert_ready_minutes smallint not null default 25 check (alert_ready_minutes between 1 and 240);
grant update (alert_accept_minutes, alert_ready_minutes) on public.restaurants to authenticated;

-- ---------- Privilegios ----------
revoke all on function public.assign_order(uuid, boolean), public.team_names(uuid) from public, anon;
grant execute on function public.assign_order(uuid, boolean), public.team_names(uuid) to authenticated;
