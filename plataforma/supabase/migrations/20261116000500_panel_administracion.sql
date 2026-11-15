-- =====================================================================
-- Fase 3 · Panel de administración
--   1. Fotos del menú en Supabase Storage (bucket público "menu").
--      Cada restaurante solo puede escribir en su carpeta <restaurant_id>/
--      y solo con el permiso menu.edit.
--   2. Empleados con usuario + contraseña, SIN clave secreta:
--      el servidor crea la cuenta con la clave pública (signUp) y esta
--      función, dentro de la base, verifica que quien la llama tenga el
--      permiso staff.manage y que la cuenta sea nueva y corresponda al
--      usuario elegido. El restaurante sale de la sesión, no del navegador.
-- =====================================================================

-- ---------- 1. Fotos ----------
create function app.uuid_o_nulo(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;
grant execute on function app.uuid_o_nulo(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu', 'menu', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Lectura: el bucket es público (las fotos del menú se ven sin sesión).
create policy menu_fotos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'menu' and app.has_permission(app.uuid_o_nulo((storage.foldername(name))[1]), 'menu.edit'));
create policy menu_fotos_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'menu' and app.has_permission(app.uuid_o_nulo((storage.foldername(name))[1]), 'menu.edit'))
  with check (bucket_id = 'menu' and app.has_permission(app.uuid_o_nulo((storage.foldername(name))[1]), 'menu.edit'));
create policy menu_fotos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'menu' and app.has_permission(app.uuid_o_nulo((storage.foldername(name))[1]), 'menu.edit'));

-- ---------- 2. Empleados ----------
-- Usuario: minúsculas, números, punto, guion y guion bajo (3 a 40).
-- Es único dentro de cada restaurante (además, el correo interno
-- <usuario>.<restaurante>@... es único en Auth).
create function app.rol_de(p_restaurant uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  where m.restaurant_id = p_restaurant and m.user_id = (select auth.uid()) and m.active;
$$;

create function public.create_staff_member(
  p_restaurant uuid, p_user_id uuid, p_username text, p_full_name text,
  p_role public.member_role, p_permissions public.permission_code[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_slug text; v_membership uuid; v_username text := lower(trim(p_username));
begin
  if not app.has_permission(p_restaurant, 'staff.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  -- Solo el dueño puede nombrar gerentes (un gerente tiene todos los permisos).
  if p_role = 'manager' and app.rol_de(p_restaurant) <> 'owner' then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_username !~ '^[a-z0-9._-]{3,40}$' then
    raise exception 'invalid_username' using errcode = '22023';
  end if;

  select slug into v_slug from public.restaurants where id = p_restaurant;

  if exists (
    select 1 from public.memberships m join public.profiles p on p.user_id = m.user_id
    where m.restaurant_id = p_restaurant and p.username = v_username
  ) then
    raise exception 'username_taken' using errcode = '23505';
  end if;

  -- La cuenta debe ser recién creada, sin perfil ni membresías, y su correo
  -- interno debe corresponder a <usuario>.<restaurante>@...
  if not exists (
    select 1 from auth.users u
    where u.id = p_user_id
      and split_part(lower(u.email), '@', 1) = v_username || '.' || v_slug
      and u.created_at > now() - interval '15 minutes'
  ) or exists (select 1 from public.profiles where user_id = p_user_id)
    or exists (select 1 from public.memberships where user_id = p_user_id) then
    raise exception 'staff_user_mismatch' using errcode = 'P0001';
  end if;

  insert into public.profiles (user_id, full_name, username, must_change_password)
  values (p_user_id, trim(p_full_name), v_username, true);

  insert into public.memberships (restaurant_id, user_id, role)
  values (p_restaurant, p_user_id, p_role)
  returning id into v_membership;

  if p_role = 'staff' then
    insert into public.membership_permissions (restaurant_id, membership_id, permission)
    select p_restaurant, v_membership, x from unnest(coalesce(p_permissions, '{}')) as x
    where x <> 'staff.manage'
    on conflict do nothing;
  end if;

  return v_membership;
end $$;

-- Valida que quien llama pueda administrar a ese empleado: con staff.manage,
-- nunca al dueño, nunca a sí mismo, y a un gerente solo si es el dueño.
create function app.puede_administrar(p_membership uuid) returns public.memberships
language plpgsql stable security definer set search_path = '' as $$
declare m public.memberships;
begin
  select * into m from public.memberships where id = p_membership;
  if not found
     or not app.has_permission(m.restaurant_id, 'staff.manage')
     or m.role = 'owner'
     or m.user_id = (select auth.uid())
     or (m.role = 'manager' and app.rol_de(m.restaurant_id) <> 'owner') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return m;
end $$;

create function public.set_staff_active(p_membership uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.puede_administrar(p_membership);
  update public.memberships set active = p_active where id = p_membership;
end $$;

create function public.set_staff_permissions(p_membership uuid, p_permissions public.permission_code[]) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := app.puede_administrar(p_membership);
  if m.role <> 'staff' then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  delete from public.membership_permissions where membership_id = p_membership;
  insert into public.membership_permissions (restaurant_id, membership_id, permission)
  select m.restaurant_id, p_membership, x from unnest(coalesce(p_permissions, '{}')) as x
  where x <> 'staff.manage'
  on conflict do nothing;
end $$;

-- El propio usuario marca que ya cambió su contraseña temporal.
create function public.mark_password_changed() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set must_change_password = false where user_id = (select auth.uid());
$$;

revoke all on function public.create_staff_member(uuid, uuid, text, text, public.member_role, public.permission_code[]),
                       public.set_staff_active(uuid, boolean),
                       public.set_staff_permissions(uuid, public.permission_code[]),
                       public.mark_password_changed(),
                       app.rol_de(uuid), app.puede_administrar(uuid)
  from public, anon;
grant execute on function public.create_staff_member(uuid, uuid, text, text, public.member_role, public.permission_code[]),
                          public.set_staff_active(uuid, boolean),
                          public.set_staff_permissions(uuid, public.permission_code[]),
                          public.mark_password_changed(),
                          app.rol_de(uuid), app.puede_administrar(uuid)
  to authenticated;
