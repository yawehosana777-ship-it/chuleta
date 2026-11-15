-- Crea TODAS las tablas y reglas de seguridad. Ejecutar UNA sola vez en Supabase > SQL Editor.
-- Generado a partir de supabase/migrations.

-- ===== 20261116000100_esquema_base.sql =====
-- =====================================================================
-- Fase 1 · Esquema base de la plataforma multi-restaurante
-- Convenciones:
--   * Todo dato de un restaurante lleva restaurant_id.
--   * Dinero en centavos enteros (Q 30.00 = 3000).
--   * Las relaciones hijas repiten restaurant_id y usan claves foráneas
--     compuestas (restaurant_id, id) para que sea IMPOSIBLE enlazar
--     filas de dos restaurantes distintos.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- Esquema interno: funciones auxiliares que no se exponen por la API.
create schema if not exists app;

-- ---------- Tipos ----------
create type public.restaurant_status   as enum ('pending', 'active', 'suspended');
create type public.member_role         as enum ('owner', 'manager', 'staff');
create type public.service_kind        as enum ('dine_in', 'delivery');
create type public.order_type          as enum ('dine_in', 'delivery');
create type public.order_status        as enum ('nuevo', 'aceptado', 'en_preparacion', 'listo', 'entregado', 'cancelado');
create type public.account_status      as enum ('open', 'closed');
create type public.delivery_method     as enum ('fixed', 'zone', 'distance');
create type public.promotion_kind      as enum ('percent', 'fixed', 'combo', 'featured');
create type public.notification_channel as enum ('sound', 'visual', 'whatsapp');
create type public.notification_status as enum ('queued', 'sent', 'failed');
create type public.permission_code     as enum (
  'orders.view', 'orders.accept', 'orders.update', 'orders.cancel',
  'tables.manage', 'menu.edit', 'staff.manage', 'settings.edit', 'reports.view'
);

-- ---------- Utilidad: updated_at automático ----------
create function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =====================================================================
-- Restaurante y acceso
-- =====================================================================
create table public.restaurants (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique
                   check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  name             text not null check (length(trim(name)) between 2 and 120),
  status           public.restaurant_status not null default 'pending',
  description      text check (length(description) <= 1000),
  timezone         text not null default 'America/Guatemala',
  currency         text not null default 'GTQ' check (currency ~ '^[A-Z]{3}$'),
  logo_path        text,
  cover_path       text,
  theme            jsonb not null default '{}'::jsonb,
  phone            text check (length(phone) <= 30),
  whatsapp         text check (length(whatsapp) <= 30),
  address          text check (length(address) <= 300),
  orders_paused    boolean not null default false,
  delivery_enabled boolean not null default false,
  dine_in_enabled  boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.opening_hours (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  service       public.service_kind not null,
  weekday       smallint not null check (weekday between 0 and 6), -- 0 = domingo
  opens_at      time not null,
  closes_at     time not null,
  check (opens_at <> closes_at)
);
create index on public.opening_hours (restaurant_id, service, weekday);

create table public.profiles (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  full_name            text not null check (length(trim(full_name)) between 1 and 120),
  username             text check (username ~ '^[a-z0-9._-]{3,40}$'),
  phone                text check (length(phone) <= 30),
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.areas (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 60),
  unique (restaurant_id, id),
  unique (restaurant_id, name)
);

create table public.memberships (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          public.member_role not null,
  area_id       uuid,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, user_id),
  unique (restaurant_id, id),
  foreign key (restaurant_id, area_id) references public.areas (restaurant_id, id) on delete set null (area_id)
);
create index on public.memberships (user_id) where active;

create table public.membership_permissions (
  restaurant_id uuid not null,
  membership_id uuid not null,
  permission    public.permission_code not null,
  primary key (membership_id, permission),
  foreign key (restaurant_id, membership_id) references public.memberships (restaurant_id, id) on delete cascade
);

-- Invitaciones de un solo uso. Se guarda SOLO el hash del token.
create table public.invitations (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  email         text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role          public.member_role not null,
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at    timestamptz not null,
  used_at       timestamptz,
  used_by       uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

-- =====================================================================
-- Menú
-- =====================================================================
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 80),
  description   text check (length(description) <= 300),
  position      integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, id)
);
create index on public.categories (restaurant_id, position);

create table public.products (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  category_id   uuid not null,
  name          text not null check (length(trim(name)) between 1 and 120),
  description   text check (length(description) <= 600),
  -- null = precio aún no confirmado: el producto se muestra pero no se puede pedir.
  price_cents   integer check (price_cents >= 0 and price_cents <= 10000000),
  active        boolean not null default true,
  sold_out      boolean not null default false,
  featured      boolean not null default false,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, id),
  foreign key (restaurant_id, category_id) references public.categories (restaurant_id, id));
create index on public.products (restaurant_id, category_id, position);

create table public.product_images (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  product_id    uuid not null,
  storage_path  text not null,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  foreign key (restaurant_id, product_id) references public.products (restaurant_id, id) on delete cascade
);

create table public.option_groups (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  product_id    uuid not null,
  name          text not null check (length(trim(name)) between 1 and 80),
  min_select    smallint not null default 0 check (min_select >= 0),
  max_select    smallint not null default 1 check (max_select >= 1),
  position      integer not null default 0,
  check (min_select <= max_select),
  unique (restaurant_id, id),
  foreign key (restaurant_id, product_id) references public.products (restaurant_id, id) on delete cascade
);

create table public.options (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null,
  group_id          uuid not null,
  name              text not null check (length(trim(name)) between 1 and 80),
  price_delta_cents integer not null default 0 check (price_delta_cents between 0 and 10000000),
  active            boolean not null default true,
  position          integer not null default 0,
  foreign key (restaurant_id, group_id) references public.option_groups (restaurant_id, id) on delete cascade
);

create table public.promotions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 120),
  description   text check (length(description) <= 600),
  kind          public.promotion_kind not null,
  -- percent: 1..100 ; fixed/combo: centavos ; featured: sin valor
  value         integer check (value >= 0),
  starts_at     timestamptz,
  ends_at       timestamptz,
  active        boolean not null default true,
  stackable     boolean not null default false,
  priority      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, id),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (kind <> 'percent' or value between 1 and 100)
);

create table public.promotion_items (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  promotion_id  uuid not null,
  product_id    uuid,
  category_id   uuid,
  quantity      smallint not null default 1 check (quantity >= 1),
  check (num_nonnulls(product_id, category_id) = 1),
  foreign key (restaurant_id, promotion_id) references public.promotions (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, product_id)   references public.products (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, category_id)  references public.categories (restaurant_id, id) on delete cascade
);

-- =====================================================================
-- Mesas y cuentas
-- =====================================================================
create table public.tables (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  label         text not null check (length(trim(label)) between 1 and 40),
  -- Código aleatorio del QR: no se puede adivinar recorriendo números.
  qr_code       text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (restaurant_id, id),
  unique (restaurant_id, label)
);

create table public.table_accounts (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id      uuid not null,
  status        public.account_status not null default 'open',
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  closed_by     uuid references auth.users (id) on delete set null,
  unique (restaurant_id, id),
  check ((status = 'closed') = (closed_at is not null)),
  foreign key (restaurant_id, table_id) references public.tables (restaurant_id, id));
-- Una sola cuenta abierta por mesa.
create unique index table_accounts_one_open on public.table_accounts (table_id) where status = 'open';

-- =====================================================================
-- Pedidos
-- =====================================================================
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants (id) on delete restrict,
  number            integer not null,
  type              public.order_type not null,
  status            public.order_status not null default 'nuevo',
  table_account_id  uuid,
  subtotal_cents    integer not null check (subtotal_cents >= 0),
  discount_cents    integer not null default 0 check (discount_cents >= 0),
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  total_cents       integer not null check (total_cents >= 0),
  customer_name     text check (length(customer_name) <= 120),
  customer_phone    text check (length(customer_phone) <= 30),
  delivery_address  text check (length(delivery_address) <= 300),
  delivery_references text check (length(delivery_references) <= 300),
  delivery_lat      double precision check (delivery_lat between -90 and 90),
  delivery_lng      double precision check (delivery_lng between -180 and 180),
  notes             text check (length(notes) <= 500),
  tracking_token    text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  idempotency_key   text not null check (length(idempotency_key) between 16 and 100),
  assigned_to       uuid references auth.users (id) on delete set null,
  accepted_by       uuid references auth.users (id) on delete set null,
  version           integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (restaurant_id, id),
  unique (restaurant_id, number),
  unique (restaurant_id, idempotency_key),          -- evita pedidos duplicados
  check (total_cents = subtotal_cents - discount_cents + delivery_fee_cents),
  check (discount_cents <= subtotal_cents),
  check (type <> 'dine_in'  or table_account_id is not null),
  check (type <> 'delivery' or (customer_name is not null and customer_phone is not null and delivery_address is not null)),
  foreign key (restaurant_id, table_account_id) references public.table_accounts (restaurant_id, id));
create index on public.orders (restaurant_id, status, created_at desc);

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null,
  order_id         uuid not null,
  product_id       uuid,
  -- Copias al momento del pedido: el historial no cambia si luego se edita el producto.
  product_name     text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity         smallint not null check (quantity between 1 and 99),
  options          jsonb not null default '[]'::jsonb,
  notes            text check (length(notes) <= 300),
  line_total_cents integer not null check (line_total_cents >= 0),
  foreign key (restaurant_id, order_id) references public.orders (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, product_id) references public.products (restaurant_id, id) on delete set null (product_id)
);
create index on public.order_items (order_id);

create table public.order_events (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id      uuid not null,
  from_status   public.order_status,
  to_status     public.order_status not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  note          text check (length(note) <= 500),
  created_at    timestamptz not null default now(),
  foreign key (restaurant_id, order_id) references public.orders (restaurant_id, id) on delete cascade
);
create index on public.order_events (order_id, created_at);

create table public.cash_payments (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants (id) on delete restrict,
  order_id         uuid,
  table_account_id uuid,
  amount_cents     integer not null check (amount_cents > 0),
  received_by      uuid references auth.users (id) on delete set null,
  confirmed_at     timestamptz not null default now(),
  check (num_nonnulls(order_id, table_account_id) = 1),
  foreign key (restaurant_id, order_id) references public.orders (restaurant_id, id) on delete restrict,
  foreign key (restaurant_id, table_account_id) references public.table_accounts (restaurant_id, id));

-- =====================================================================
-- Entregas, avisos y auditoría
-- =====================================================================
create table public.delivery_settings (
  restaurant_id     uuid primary key references public.restaurants (id) on delete cascade,
  method            public.delivery_method not null default 'fixed',
  fixed_fee_cents   integer check (fixed_fee_cents >= 0),
  min_order_cents   integer not null default 0 check (min_order_cents >= 0),
  base_fee_cents    integer check (base_fee_cents >= 0),
  per_km_fee_cents  integer check (per_km_fee_cents >= 0),
  max_km            numeric(6,2) check (max_km > 0),
  origin_lat        double precision check (origin_lat between -90 and 90),
  origin_lng        double precision check (origin_lng between -180 and 180),
  updated_at        timestamptz not null default now()
);

create table public.delivery_zones (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 80),
  fee_cents     integer not null check (fee_cents >= 0),
  active        boolean not null default true,
  unique (restaurant_id, name)
);

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id      uuid not null,
  channel       public.notification_channel not null,
  status        public.notification_status not null default 'queued',
  attempts      smallint not null default 0,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (restaurant_id, order_id) references public.orders (restaurant_id, id) on delete cascade
);

create table public.audit_log (
  id            bigint generated always as identity primary key,
  -- Sin clave foránea: el historial se conserva aunque se borre el restaurante.
  restaurant_id uuid,
  actor_user_id uuid,
  action        text not null,         -- insert / update / delete
  entity        text not null,         -- nombre de la tabla
  entity_id     uuid,
  before        jsonb,
  after         jsonb,
  created_at    timestamptz not null default now()
);
create index on public.audit_log (restaurant_id, created_at desc);

-- ---------- updated_at ----------
do $$
declare t text;
begin
  foreach t in array array['restaurants','profiles','memberships','categories','products',
                           'promotions','orders','delivery_settings','notifications']
  loop
    execute format('create trigger touch_updated_at before update on public.%I
                    for each row execute function app.touch_updated_at()', t);
  end loop;
end $$;

-- ===== 20261116000200_seguridad.sql =====
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

-- ===== 20261116000300_invitaciones_sin_clave_secreta.sql =====
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
