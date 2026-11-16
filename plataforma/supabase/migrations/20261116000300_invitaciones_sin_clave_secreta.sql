-- =====================================================================
-- Fase 1 · Invitaciones que funcionan SIN la clave secreta.
--
-- El dueño crea su cuenta con la clave pública (signUp) y luego esta
-- función, que corre dentro de la base de datos, verifica:
--   * que el token sea válido, no usado y no vencido;
--   * que la cuenta recién creada tenga EXACTAMENTE el correo invitado;
--   * que la cuenta tenga menos de 15 minutos (no se pueden "adoptar"
--     cuentas viejas de otras personas).
-- El token tiene 256 bits aleatorios: no se puede adivinar.
-- =====================================================================

create function app.token_hash(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

create function app.token_valido(p_token text) returns boolean
language sql immutable set search_path = '' as $$
  select p_token ~ '^[A-Za-z0-9_-]{43}$';
$$;

-- Vista previa para la pantalla de invitación (no revela nada sin el token).
create function public.invitation_preview_by_token(p_token text)
returns table (restaurant_name text, email text, role public.member_role, expired boolean, used boolean)
language sql stable security definer set search_path = '' as $$
  select r.name, i.email, i.role, i.expires_at <= now(), i.used_at is not null
  from public.invitations i
  join public.restaurants r on r.id = i.restaurant_id
  where app.token_valido(p_token) and i.token_hash = app.token_hash(p_token);
$$;

create function public.accept_invitation_signup(p_token text, p_user_id uuid, p_full_name text)
returns text
language plpgsql security definer set search_path = '' as $$
declare inv public.invitations;
begin
  if not app.token_valido(p_token) then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
  -- Si quien llama ya tiene sesión, solo puede aceptar para sí mismo.
  if (select auth.uid()) is not null and (select auth.uid()) <> p_user_id then
    raise exception 'invitation_user_mismatch' using errcode = 'P0001';
  end if;

  select * into inv from public.invitations where token_hash = app.token_hash(p_token);
  if not found then raise exception 'invitation_not_found' using errcode = 'P0002'; end if;

  if not exists (
    select 1 from auth.users u
    where u.id = p_user_id
      and lower(u.email) = inv.email
      and u.created_at > now() - interval '15 minutes'
  ) then
    raise exception 'invitation_user_mismatch' using errcode = 'P0001';
  end if;

  -- Reutiliza la lógica atómica (bloqueo, un solo uso, vencimiento, activación).
  return public.accept_invitation(inv.token_hash, p_user_id, p_full_name);
end $$;

-- ---------- Para usar desde el SQL Editor de Supabase ----------
-- Generan el token dentro de la base y lo devuelven UNA vez; solo se guarda su hash.

create function app.nuevo_token() returns text
language sql volatile set search_path = '' as $$
  select translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
$$;

create function public.create_restaurant_invite(p_name text, p_slug text, p_owner_email text)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text := app.nuevo_token();
begin
  perform public.create_restaurant_with_invitation(
    p_name, p_slug, p_owner_email, app.token_hash(v_token), now() + interval '72 hours');
  return v_token;
end $$;

create function public.new_invitation_token(p_slug text, p_email text, p_role public.member_role default 'owner')
returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text := app.nuevo_token();
begin
  perform public.new_invitation(p_slug, p_email, p_role, app.token_hash(v_token), now() + interval '72 hours');
  return v_token;
end $$;

revoke all on function app.token_hash(text), app.token_valido(text), app.nuevo_token() from public;

revoke all on function public.invitation_preview_by_token(text),
                       public.accept_invitation_signup(text, uuid, text),
                       public.create_restaurant_invite(text, text, text),
                       public.new_invitation_token(text, text, public.member_role)
  from public, anon, authenticated;

grant execute on function public.invitation_preview_by_token(text),
                          public.accept_invitation_signup(text, uuid, text)
  to anon, authenticated;

grant execute on function public.create_restaurant_invite(text, text, text),
                          public.new_invitation_token(text, text, public.member_role)
  to service_role;
