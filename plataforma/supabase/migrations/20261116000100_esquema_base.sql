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
