-- =====================================================================
-- Fase 1 · Seguridad: aislamiento por restaurante (RLS), permisos,
-- auditoría y funciones que solo puede usar el servidor.
--
-- Regla de oro: el restaurante al que un usuario tiene acceso se obtiene
-- de SU sesión (auth.uid()) y de la tabla memberships, nunca de un dato
-- enviado por el navegador.
-- =====================================================================

-- ---------- Funciones auxiliares (esquema interno "app") ----------

-- ¿El usuario actual es miembro activo de un restaurante no suspendido?
create function app.is_member(p_restaurant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.restaurants r on r.id = m.restaurant_id
    where m.restaurant_id = p_restaurant
      and m.user_id = (select auth.uid())
      and m.active
      and r.status <> 'suspended'
  );
$$;

-- ¿El usuario actual tiene un permiso en ese restaurante?
-- Dueño y gerente tienen todos; el personal solo los que se le asignen.
create function app.has_permission(p_restaurant uuid, p_perm public.permission_code) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.restaurants r on r.id = m.restaurant_id
    where m.restaurant_id = p_restaurant
      and m.user_id = (select auth.uid())
      and m.active
      and r.status <> 'suspended'
      and (
        m.role in ('owner', 'manager')
        or exists (select 1 from public.membership_permissions mp
                   where mp.membership_id = m.id and mp.permission = p_perm)
      )
  );
$$;

-- ¿El restaurante es visible para el público?
create function app.is_public(p_restaurant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.restaurants r where r.id = p_restaurant and r.status = 'active');
$$;

-- ¿El usuario actual puede administrar el perfil de otro usuario?
create function app.can_manage_user(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships target
    where target.user_id = p_user
      and app.has_permission(target.restaurant_id, 'staff.manage')
  );
$$;

grant usage on schema app to anon, authenticated;
revoke all on all functions in schema app from public;
grant execute on function app.is_member(uuid), app.has_permission(uuid, public.permission_code),
                          app.is_public(uuid), app.can_manage_user(uuid)
  to anon, authenticated;

-- ---------- Privilegios de tabla: se parte de cero ----------
revoke all on all tables in schema public from anon, authenticated;

-- Lectura pública (menú del cliente). RLS decide QUÉ filas.
grant select on public.restaurants, public.opening_hours, public.categories, public.products,
                public.product_images, public.option_groups, public.options,
                public.promotions, public.promotion_items,
                public.delivery_settings, public.delivery_zones
  to anon, authenticated;

-- Lectura para personal autenticado. RLS decide QUÉ filas.
grant select on public.profiles, public.areas, public.memberships, public.membership_permissions,
                public.tables, public.table_accounts, public.orders, public.order_items,
                public.order_events, public.cash_payments, public.notifications, public.audit_log
  to authenticated;

-- Escritura del panel (con permisos verificados por RLS).
grant insert, update, delete on public.opening_hours, public.areas, public.categories, public.products,
                                public.product_images, public.option_groups, public.options,
                                public.promotions, public.promotion_items, public.tables,
                                public.delivery_zones
  to authenticated;
grant insert, update on public.delivery_settings to authenticated;

-- El dueño NO puede cambiar por la API el slug ni el estado del restaurante.
grant update (name, description, timezone, logo_path, cover_path, theme, phone, whatsapp, address,
              orders_paused, delivery_enabled, dine_in_enabled)
  on public.restaurants to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- invitations: sin privilegios para anon/authenticated (solo el servidor).
-- orders, table_accounts, cash_payments, memberships: se escribirán mediante
-- funciones transaccionales en las Fases 3–5, no directamente.

-- ---------- Activar RLS en todas las tablas ----------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------- Políticas ----------

-- Restaurantes
create policy restaurants_select on public.restaurants for select to anon, authenticated
  using (status = 'active' or app.is_member(id));
create policy restaurants_update on public.restaurants for update to authenticated
  using (app.has_permission(id, 'settings.edit'))
  with check (app.has_permission(id, 'settings.edit'));

-- Horarios
create policy opening_hours_select on public.opening_hours for select to anon, authenticated
  using (app.is_public(restaurant_id) or app.is_member(restaurant_id));
create policy opening_hours_write on public.opening_hours for all to authenticated
  using (app.has_permission(restaurant_id, 'settings.edit'))
  with check (app.has_permission(restaurant_id, 'settings.edit'));

-- Perfiles
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or app.can_manage_user(user_id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Áreas / turnos
create policy areas_select on public.areas for select to authenticated
  using (app.is_member(restaurant_id));
create policy areas_write on public.areas for all to authenticated
  using (app.has_permission(restaurant_id, 'settings.edit'))
  with check (app.has_permission(restaurant_id, 'settings.edit'));

-- Membresías y permisos (solo lectura en Fase 1)
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or app.has_permission(restaurant_id, 'staff.manage'));
create policy membership_permissions_select on public.membership_permissions for select to authenticated
  using (
    exists (select 1 from public.memberships m where m.id = membership_id and m.user_id = (select auth.uid()))
    or app.has_permission(restaurant_id, 'staff.manage')
  );

-- Categorías y productos: el público ve solo lo activo de restaurantes activos.
create policy categories_select on public.categories for select to anon, authenticated
  using ((active and app.is_public(restaurant_id)) or app.is_member(restaurant_id));
create policy categories_write on public.categories for all to authenticated
  using (app.has_permission(restaurant_id, 'menu.edit'))
  with check (app.has_permission(restaurant_id, 'menu.edit'));

create policy products_select on public.products for select to anon, authenticated
  using (
    (active and app.is_public(restaurant_id)
       and exists (select 1 from public.categories c where c.id = category_id and c.active))
    or app.is_member(restaurant_id)
  );
create policy products_write on public.products for all to authenticated
  using (app.has_permission(restaurant_id, 'menu.edit'))
  with check (app.has_permission(restaurant_id, 'menu.edit'));

-- Imágenes, grupos de opciones y opciones heredan la visibilidad del producto
-- (la subconsulta respeta el RLS de products).
create policy product_images_select on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy product_images_write on public.product_images for all to authenticated
  using (app.has_permission(restaurant_id, 'menu.edit'))
  with check (app.has_permission(restaurant_id, 'menu.edit'));

create policy option_groups_select on public.option_groups for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy option_groups_write on public.option_groups for all to authenticated
  using (app.has_permission(restaurant_id, 'menu.edit'))
  with check (app.has_permission(restaurant_id, 'menu.edit'));

create policy options_select on public.options for select to anon, authenticated
  using (
    (active and exists (select 1 from public.option_groups g where g.id = group_id))
    or app.is_member(restaurant_id)
  );
create policy options_write on public.options for all to authenticated
  using (app.has_permission(restaurant_id, 'menu.edit'))
  with check (app.has_permission(restaurant_id, 'menu.edit'));

-- Promociones: el público solo ve las vigentes.
create policy promotions_select on public.promotions for select to anon, authenticated
  using (
    (active and app.is_public(restaurant_id)
       and (starts_at is null or starts_at <= now())
       and (ends_at is null or ends_at > now()))
    or app.is_member(restaurant_id)
  );
create policy promotions_write on public.promotions for all to authenticated
  using (app.has_permission(restaurant_id, 'menu.edit'))
  with check (app.has_permission(restaurant_id, 'menu.edit'));

create policy promotion_items_select on public.promotion_items for select to anon, authenticated
  using (exists (select 1 from public.promotions p where p.id = promotion_id));
create policy promotion_items_write on public.promotion_items for all to authenticated
  using (app.has_permission(restaurant_id, 'menu.edit'))
  with check (app.has_permission(restaurant_id, 'menu.edit'));

-- Mesas: el público NO puede listarlas (se resolverán por código QR en el servidor).
create policy tables_select on public.tables for select to authenticated
  using (app.is_member(restaurant_id));
create policy tables_write on public.tables for all to authenticated
  using (app.has_permission(restaurant_id, 'tables.manage'))
  with check (app.has_permission(restaurant_id, 'tables.manage'));

-- Cuentas de mesa, pedidos y relacionados: solo lectura para personal con permiso.
create policy table_accounts_select on public.table_accounts for select to authenticated
  using (app.has_permission(restaurant_id, 'orders.view'));
create policy orders_select on public.orders for select to authenticated
  using (app.has_permission(restaurant_id, 'orders.view'));
create policy order_items_select on public.order_items for select to authenticated
  using (app.has_permission(restaurant_id, 'orders.view'));
create policy order_events_select on public.order_events for select to authenticated
  using (app.has_permission(restaurant_id, 'orders.view'));
create policy cash_payments_select on public.cash_payments for select to authenticated
  using (app.has_permission(restaurant_id, 'orders.view') or app.has_permission(restaurant_id, 'reports.view'));
create policy notifications_select on public.notifications for select to authenticated
  using (app.has_permission(restaurant_id, 'orders.view'));

-- Entregas
create policy delivery_settings_select on public.delivery_settings for select to anon, authenticated
  using (app.is_public(restaurant_id) or app.is_member(restaurant_id));
create policy delivery_settings_write on public.delivery_settings for all to authenticated
  using (app.has_permission(restaurant_id, 'settings.edit'))
  with check (app.has_permission(restaurant_id, 'settings.edit'));
create policy delivery_zones_select on public.delivery_zones for select to anon, authenticated
  using ((active and app.is_public(restaurant_id)) or app.is_member(restaurant_id));
create policy delivery_zones_write on public.delivery_zones for all to authenticated
  using (app.has_permission(restaurant_id, 'settings.edit'))
  with check (app.has_permission(restaurant_id, 'settings.edit'));

-- Auditoría
create policy audit_log_select on public.audit_log for select to authenticated
  using (app.has_permission(restaurant_id, 'reports.view'));

-- invitations: RLS activo y SIN políticas → nadie fuera del servidor puede leerla.

-- =====================================================================
-- Auditoría automática de cambios importantes
-- =====================================================================
create function app.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  j jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  rid uuid;
begin
  rid := case when tg_table_name = 'restaurants' then (j->>'id')::uuid
              else (j->>'restaurant_id')::uuid end;
  insert into public.audit_log (restaurant_id, actor_user_id, action, entity, entity_id, before, after)
  values (
    rid,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    case when j ? 'id' then (j->>'id')::uuid end,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['restaurants','memberships','membership_permissions','categories','products',
                           'option_groups','options','promotions','promotion_items','tables',
                           'delivery_settings','delivery_zones','opening_hours']
  loop
    execute format('create trigger audit after insert or update or delete on public.%I
                    for each row execute function app.audit()', t);
  end loop;
end $$;

-- =====================================================================
-- Funciones SOLO para el servidor (clave secreta). Alta de restaurantes
-- e invitaciones de un solo uso.
-- =====================================================================

create function public.create_restaurant_with_invitation(
  p_name text, p_slug text, p_email text, p_token_hash text, p_expires_at timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.restaurants (name, slug, status)
  values (trim(p_name), lower(trim(p_slug)), 'pending')
  returning id into v_id;

  insert into public.delivery_settings (restaurant_id) values (v_id);

  insert into public.invitations (restaurant_id, email, role, token_hash, expires_at)
  values (v_id, lower(trim(p_email)), 'owner', p_token_hash, p_expires_at);

  return v_id;
end $$;

create function public.new_invitation(
  p_slug text, p_email text, p_role public.member_role, p_token_hash text, p_expires_at timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_restaurant uuid; v_id uuid;
begin
  select id into v_restaurant from public.restaurants where slug = p_slug;
  if v_restaurant is null then
    raise exception 'restaurant_not_found' using errcode = 'P0002';
  end if;
  insert into public.invitations (restaurant_id, email, role, token_hash, expires_at)
  values (v_restaurant, lower(trim(p_email)), p_role, p_token_hash, p_expires_at)
  returning id into v_id;
  return v_id;
end $$;

create function public.invitation_preview(p_token_hash text)
returns table (restaurant_name text, email text, role public.member_role, expired boolean, used boolean)
language sql stable security definer set search_path = '' as $$
  select r.name, i.email, i.role, i.expires_at <= now(), i.used_at is not null
  from public.invitations i
  join public.restaurants r on r.id = i.restaurant_id
  where i.token_hash = p_token_hash;
$$;

-- Acepta una invitación de forma atómica. El usuario de Auth ya debe existir.
create function public.accept_invitation(p_token_hash text, p_user_id uuid, p_full_name text)
returns text
language plpgsql security definer set search_path = '' as $$
declare inv public.invitations; v_slug text;
begin
  select * into inv from public.invitations where token_hash = p_token_hash for update;
  if not found then raise exception 'invitation_not_found' using errcode = 'P0002'; end if;
  if inv.used_at is not null then raise exception 'invitation_used' using errcode = 'P0001'; end if;
  if inv.expires_at <= now() then raise exception 'invitation_expired' using errcode = 'P0001'; end if;

  insert into public.profiles (user_id, full_name)
  values (p_user_id, trim(p_full_name))
  on conflict (user_id) do update set full_name = excluded.full_name;

  insert into public.memberships (restaurant_id, user_id, role)
  values (inv.restaurant_id, p_user_id, inv.role)
  on conflict (restaurant_id, user_id) do update set role = excluded.role, active = true;

  update public.invitations set used_at = now(), used_by = p_user_id where id = inv.id;

  update public.restaurants set status = 'active'
  where id = inv.restaurant_id and status = 'pending' and inv.role = 'owner'
  returning slug into v_slug;

  if v_slug is null then
    select slug into v_slug from public.restaurants where id = inv.restaurant_id;
  end if;
  return v_slug;
end $$;

create function public.set_restaurant_status(p_slug text, p_status public.restaurant_status)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.restaurants set status = p_status where slug = p_slug;
  if not found then raise exception 'restaurant_not_found' using errcode = 'P0002'; end if;
end $$;

revoke all on function public.create_restaurant_with_invitation(text, text, text, text, timestamptz),
                       public.new_invitation(text, text, public.member_role, text, timestamptz),
                       public.invitation_preview(text),
                       public.accept_invitation(text, uuid, text),
                       public.set_restaurant_status(text, public.restaurant_status)
  from public, anon, authenticated;
grant execute on function public.create_restaurant_with_invitation(text, text, text, text, timestamptz),
                          public.new_invitation(text, text, public.member_role, text, timestamptz),
                          public.invitation_preview(text),
                          public.accept_invitation(text, uuid, text),
                          public.set_restaurant_status(text, public.restaurant_status)
  to service_role;
