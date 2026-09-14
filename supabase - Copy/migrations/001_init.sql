-- =============================================================
-- IYAWO XSTO FABRIC STORE - DATABASE SETUP
-- -------------------------------------------------------------
-- HOW TO RUN:
--   1. Create your Supabase project (free plan is fine).
--   2. Open the SQL Editor in the Supabase dashboard.
--   3. Paste this whole file and click RUN.
--   4. Keep a copy of this file - you can re-run it safely.
--
-- This creates: categories, products, orders, order_items,
-- delivery_config, admins + RLS + storage bucket + seed data.
-- =============================================================

create extension if not exists pgcrypto;

-- =============================================================
-- TABLES
-- =============================================================

-- -------------------------------------------------------------
-- CATEGORIES (expandable - add more later from the admin panel)
-- -------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  image_url   text,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -------------------------------------------------------------
-- PRODUCTS
-- -------------------------------------------------------------
create table if not exists public.products (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null unique,
  category            text not null references public.categories(slug),
  description         text,
  price               numeric(12,2) not null default 0,
  sale_price          numeric(12,2),
  is_on_sale          boolean not null default false,
  price_unit          text not null default 'yard',
  stock_quantity      numeric(10,2) not null default 0,
  stock_status        text not null default 'in_stock'
                      check (stock_status in ('in_stock', 'out_of_stock')),
  image_url           text,
  additional_images   jsonb not null default '[]'::jsonb,
  featured            boolean not null default false,
  active              boolean not null default true,
  wholesale_available boolean not null default false,
  retail_available    boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- -------------------------------------------------------------
-- ORDERS
-- -------------------------------------------------------------
create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text not null unique,
  customer_id      uuid references auth.users(id) on delete set null,
  customer_name    text not null,
  customer_email   text not null,
  customer_phone   text not null,
  delivery_address text,
  city             text,
  state            text,
  delivery_note    text,
  subtotal         numeric(12,2) not null default 0,
  delivery_fee     numeric(12,2) not null default 0,
  total_amount     numeric(12,2) not null default 0,
  payment_status   text not null default 'pending'
                   check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  payment_method   text not null default 'paystack'
                   check (payment_method in ('paystack', 'whatsapp')),
  order_status     text not null default 'pending'
                   check (order_status in ('pending', 'confirmed', 'processing',
                                           'ready_for_delivery', 'shipped',
                                           'delivered', 'cancelled')),
  payment_reference text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- -------------------------------------------------------------
-- ORDER ITEMS (product name + price are SNAPSHOTTED at purchase)
-- -------------------------------------------------------------
create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  product_name text not null,
  product_slug text,
  price        numeric(12,2) not null,
  quantity     numeric(10,2) not null,
  subtotal     numeric(12,2) not null,
  unit         text not null default 'yard',
  image_url    text
);

-- -------------------------------------------------------------
-- DELIVERY CONFIG (store owner edits fees from the admin panel)
-- -------------------------------------------------------------
create table if not exists public.delivery_config (
  id           uuid primary key default gen_random_uuid(),
  zone         text not null unique,
  label        text not null,
  fee          numeric(12,2) not null default 0,
  match_cities text[] not null default '{}'::text[],
  match_states text[] not null default '{}'::text[],
  is_fallback  boolean not null default false,
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- -------------------------------------------------------------
-- ADMINS (links a Supabase Auth user to admin privileges)
-- -------------------------------------------------------------
create table if not exists public.admins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

-- =============================================================
-- INDEXES
-- =============================================================
create index if not exists idx_products_category_active on public.products (category, active);
create index if not exists idx_products_featured on public.products (featured) where featured;
create index if not exists idx_products_sale on public.products (is_on_sale) where is_on_sale;
create index if not exists idx_products_created on public.products (created_at desc);
create index if not exists idx_orders_created on public.orders (created_at desc);
create index if not exists idx_orders_payment on public.orders (payment_status);
create index if not exists idx_orders_email on public.orders (customer_email);
create index if not exists idx_order_items_order on public.order_items (order_id);

-- =============================================================
-- UPDATED_AT TRIGGER
-- =============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_categories_updated on public.categories;
create trigger trg_categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated on public.orders;
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists trg_delivery_updated on public.delivery_config;
create trigger trg_delivery_updated before update on public.delivery_config
  for each row execute function public.set_updated_at();

-- =============================================================
-- HELPERS
-- =============================================================

-- True when the currently authenticated user is an admin.
-- Used by RLS policies below.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Atomically remove stock AFTER a payment is verified.
-- Returns false when there is not enough stock.
-- Only the service role (serverless backend) may call this.
create or replace function public.decrement_stock(p_product_id uuid, p_quantity numeric)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_remaining numeric;
begin
  update public.products
     set stock_quantity = stock_quantity - p_quantity,
         updated_at = now(),
         stock_status = case
           when (stock_quantity - p_quantity) <= 0 then 'out_of_stock'
           else 'in_stock'
         end
   where id = p_product_id
     and active = true
     and stock_quantity >= p_quantity
   returning stock_quantity into v_remaining;

  if not found then
    return false;
  end if;

  return true;
end;
$$;

revoke execute on function public.decrement_stock(uuid, numeric) from public, anon, authenticated;
grant execute on function public.decrement_stock(uuid, numeric) to service_role;

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;
alter table public.delivery_config enable row level security;
alter table public.admins         enable row level security;

-- CATEGORIES: everyone reads active ones; only admins write.
drop policy if exists "categories public read" on public.categories;
create policy "categories public read" on public.categories
  for select using (active = true);

drop policy if exists "categories admin write" on public.categories;
create policy "categories admin write" on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

-- PRODUCTS: everyone reads active ones; only admins write.
drop policy if exists "products public read" on public.products;
create policy "products public read" on public.products
  for select using (active = true);

drop policy if exists "products admin write" on public.products;
create policy "products admin write" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- ORDERS: customers see/edit their own; admins see everything.
drop policy if exists "orders owner read" on public.orders;
create policy "orders owner read" on public.orders
  for select using (customer_id = auth.uid() or public.is_admin());

drop policy if exists "orders owner insert" on public.orders;
create policy "orders owner insert" on public.orders
  for insert with check (customer_id = auth.uid());

drop policy if exists "orders admin update" on public.orders;
create policy "orders admin update" on public.orders
  for update using (public.is_admin()) with check (public.is_admin());

-- ORDER ITEMS: via the parent order.
drop policy if exists "order_items owner read" on public.order_items;
create policy "order_items owner read" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "order_items owner insert" on public.order_items;
create policy "order_items owner insert" on public.order_items
  for insert with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.customer_id = auth.uid()
    )
  );

drop policy if exists "order_items admin update" on public.order_items;
create policy "order_items admin update" on public.order_items
  for update using (public.is_admin()) with check (public.is_admin());

-- DELIVERY CONFIG: everyone reads active zones; only admins write.
drop policy if exists "delivery public read" on public.delivery_config;
create policy "delivery public read" on public.delivery_config
  for select using (active = true);

drop policy if exists "delivery admin write" on public.delivery_config;
create policy "delivery admin write" on public.delivery_config
  for all using (public.is_admin()) with check (public.is_admin());

-- ADMINS: a user can only read their own admin row (frontend check).
drop policy if exists "admins read own" on public.admins;
create policy "admins read own" on public.admins
  for select using (user_id = auth.uid());

-- =============================================================
-- STORAGE - product-images bucket
-- Public reads (product photos), admin-only writes.
-- =============================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product images public read" on storage.objects;
create policy "product images public read" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "product images admin insert" on storage.objects;
create policy "product images admin insert" on storage.objects
  for insert with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "product images admin update" on storage.objects;
create policy "product images admin update" on storage.objects
  for update using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "product images admin delete" on storage.objects;
create policy "product images admin delete" on storage.objects
  for delete using (bucket_id = 'product-images' and public.is_admin());

-- =============================================================
-- SEED DATA
-- =============================================================

-- CATEGORIES (based on the existing website)
insert into public.categories (name, slug, description, image_url, sort_order) values
  ('Swiss Lace',  'swiss-lace',  'Elegant Swiss lace designs for unforgettable outfits.',
   '/assets/images/Swiss Lace/1 (27).jpg', 1),
  ('Ankara Lace', 'ankara-lace', 'Bold patterns and beautiful colours.',
   '/assets/images/Ankara Lace/1 (11).jpg', 2),
  ('Beaded Lace', 'beaded-lace', 'Luxury detailing for your special moments.',
   '/assets/images/Beaded Lace/1 (16).jpg', 3),
  ('White Lace',  'white-lace',  'Clean, timeless and effortlessly elegant.',
   '/assets/images/White fine lace/1 (23).jpg', 4),
  ('Damask',      'damask',      'Rich textures for timeless fashion.',
   '/assets/images/Damask/1 (2).jpg', 5)
on conflict (slug) do nothing;

-- DELIVERY ZONES (store owner can change fees later from Admin > Settings)
insert into public.delivery_config (zone, label, fee, match_cities, match_states, is_fallback, sort_order) values
  ('Ilorin',            'Ilorin',                    3000, array['ilorin'], array['kwara'], false, 1),
  ('kwara-other',       'Kwara (outside Ilorin)',    5000, '{}'::text[],   array['kwara'], false, 2),
  ('other-states',      'Other States',              8000, '{}'::text[],   '{}'::text[],   true,  3)
on conflict (zone) do nothing;

-- SAMPLE PRODUCTS (prices match the current website)
insert into public.products
  (name, slug, category, description, price, sale_price, is_on_sale,
   price_unit, stock_quantity, stock_status, image_url, featured, active,
   wholesale_available, retail_available)
values
  ('Latest Swiss Lace', 'latest-swiss-lace', 'swiss-lace',
   'Beautiful Swiss lace available in unit and bulk quantities.',
   14000, 12000, true, 'yard', 50, 'in_stock', '/assets/images/Swiss Lace/1 (24).jpg',
   true, true, true, true),

  ('Block Design Swiss Lace', 'block-design-swiss-lace', 'swiss-lace',
   'Elegant block design lace available for retail and wholesale.',
   8000, 6500, true, 'yard', 40, 'in_stock', '/assets/images/Swiss Lace/1 (10).jpg',
   false, true, true, true),

  ('Wine Sequence Lace', 'wine-sequence-lace', 'swiss-lace',
   'Plain wine lace with beautiful sequence detailing.',
   7000, 6000, true, 'yard', 35, 'in_stock', '/assets/images/Swiss Lace/1 (15).jpg',
   false, true, true, true),

  ('Multi-Color Swiss Lace', 'multi-color-swiss-lace', 'swiss-lace',
   'Latest multi-color Swiss lace available in unit and bulk quantities.',
   14000, 12000, true, 'yard', 8, 'in_stock', '/assets/images/Swiss Lace/1 (18).jpg',
   false, true, true, true),

  ('White Ankara Lace', 'white-ankara-lace', 'ankara-lace',
   'Latest Ankara lace available in unit and bulk quantities.',
   35000, 33000, true, 'yard', 25, 'in_stock', '/assets/images/Ankara Lace/1 (21).jpg',
   true, true, true, true),

  ('Two Colored Ankara Lace', 'two-colored-ankara-lace', 'ankara-lace',
   'Beautiful two-colour lace with double-layer design.',
   25000, 23000, true, 'yard', 20, 'in_stock', '/assets/images/Ankara Lace/1 (12).jpg',
   false, true, true, true),

  ('Multi Layer Lace', 'multi-layer-lace', 'ankara-lace',
   'Elegant multi-layer lace with beautiful detailing.',
   25000, 23000, true, 'yard', 18, 'in_stock', '/assets/images/Ankara Lace/1 (7).jpg',
   false, true, true, true),

  ('Full Beaded Lace', 'full-beaded-lace', 'beaded-lace',
   'Premium full beaded lace for elegant occasions.',
   25000, 22000, true, 'yard', 6, 'in_stock', '/assets/images/Beaded Lace/1 (7).jpg',
   true, true, true, true),

  ('Premium Beaded Lace', 'premium-beaded-lace', 'beaded-lace',
   'Stylish beaded lace available in different designs.',
   25000, 22000, true, 'yard', 15, 'in_stock', '/assets/images/Beaded Lace/1 (17).jpg',
   false, true, true, true),

  ('Luxury Beaded Lace', 'luxury-beaded-lace', 'beaded-lace',
   'Beautiful luxury lace for special occasions.',
   20000, 18000, true, 'yard', 12, 'in_stock', '/assets/images/Beaded Lace/1 (34).jpg',
   false, true, true, true),

  ('White Swiss Lace', 'white-swiss-lace', 'white-lace',
   'Beautiful white Swiss lace for elegant outfits.',
   8500, 7000, true, 'yard', 30, 'in_stock', '/assets/images/White fine lace/1 (23).jpg',
   false, true, true, true),

  ('White Fine Lace', 'white-fine-lace', 'white-lace',
   'Quality white lace suitable for different occasions.',
   8500, 7000, true, 'yard', 22, 'in_stock', '/assets/images/White fine lace/1 (27).jpg',
   false, true, true, true),

  ('Premium White Lace', 'premium-white-lace', 'white-lace',
   'High-quality white lace for your fashion needs.',
   8500, 7000, true, 'yard', 0, 'out_of_stock', '/assets/images/White fine lace/1 (25).jpg',
   false, true, true, true),

  ('Quality Damask', 'quality-damask', 'damask',
   'Quality Damask double-length fabric.',
   8000, 7500, true, 'yard', 45, 'in_stock', '/assets/images/Damask/1 (15).jpg',
   false, true, true, true),

  ('Damask Double Length', 'damask-double-length', 'damask',
   'Beautiful Damask material available in unit and bulk.',
   8000, 7500, true, 'yard', 38, 'in_stock', '/assets/images/Damask/1 (19).jpg',
   false, true, true, true),

  ('Latest Damask', 'latest-damask', 'damask',
   'Elegant Damask double-length material for beautiful outfits.',
   8000, 7500, true, 'yard', 33, 'in_stock', '/assets/images/Damask/1 (7).jpg',
   false, true, true, true)
on conflict (slug) do nothing;

-- =============================================================
-- DONE - NEXT STEP
-- 1) Create the first admin user:
--    a) Supabase Dashboard > Authentication > Users > Add user
--       (email + password, email confirmation ON).
--    b) Run:  insert into public.admins (user_id, email)
--             select id, email from auth.users where email = 'YOU@EMAIL.COM';
--    OR use the one-time invite flow at /admin/login with the
--       ADMIN_INVITE_CODE environment variable set.
-- =============================================================