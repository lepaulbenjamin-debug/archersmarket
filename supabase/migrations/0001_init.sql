-- Archers Market — schéma initial
-- Cible : Postgres 15+ / Supabase (auth.users fournit l'authentification).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Référentiels métier (alignés sur src/data/catalog.ts)
-- ---------------------------------------------------------------------------

create type listing_category as enum (
  'bow-recurve', 'bow-compound', 'bow-longbow', 'arrows', 'sight', 'stabilizer',
  'release', 'quiver', 'protection', 'string', 'target', 'apparel'
);

create type listing_condition as enum ('new', 'like-new', 'very-good', 'good', 'fair');

create type handedness as enum ('right', 'left', 'na');

create type listing_status as enum ('draft', 'active', 'reserved', 'sold');

-- ---------------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  handle text unique not null,
  name text not null,
  city text not null default '',
  club text,
  bio text,
  discipline text,
  avatar_color text not null default '#F5843C',
  avatar_path text,
  rating numeric(2, 1) not null default 0 check (rating between 0 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Crée le profil dès l'inscription, à partir des métadonnées d'inscription.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, handle, name, city, club)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'handle', ''),
      'archer_' || substr(replace(new.id::text, '-', ''), 1, 8)
    ),
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), 'Archer'),
    coalesce(new.raw_user_meta_data ->> 'city', ''),
    nullif(new.raw_user_meta_data ->> 'club', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Annonces
-- ---------------------------------------------------------------------------

create table listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references profiles(id) on delete cascade,
  title text not null check (char_length(title) between 6 and 120),
  description text not null check (char_length(description) >= 20),
  price numeric(10, 2) not null check (price > 0),
  original_price numeric(10, 2) check (original_price > price),
  category listing_category not null,
  brand text not null,
  condition listing_condition not null,
  hand handedness not null default 'na',
  -- Caractéristiques techniques, selon la catégorie
  draw_weight numeric(4, 1) check (draw_weight > 0),
  bow_length numeric(4, 1) check (bow_length > 0),
  draw_length numeric(4, 1) check (draw_length > 0),
  spine integer check (spine > 0),
  size text,
  city text not null,
  shipping boolean not null default true,
  shipping_price numeric(6, 2) check (shipping_price >= 0),
  status listing_status not null default 'active',
  views integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector(
      'french',
      coalesce(title, '') || ' ' || coalesce(brand, '') || ' ' ||
      coalesce(city, '') || ' ' || coalesce(description, '')
    )
  ) stored
);

create index listings_search_idx on listings using gin (search_vector);
create index listings_browse_idx on listings (status, created_at desc);
create index listings_category_idx on listings (category) where status = 'active';
create index listings_seller_idx on listings (seller_id, created_at desc);

create table listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  -- Chemin dans le bucket Storage « listing-photos »
  path text not null,
  position smallint not null default 0 check (position between 0 and 9),
  created_at timestamptz not null default now(),
  unique (listing_id, position)
);

create index listing_images_listing_idx on listing_images (listing_id, position);

-- ---------------------------------------------------------------------------
-- Favoris
-- ---------------------------------------------------------------------------

create table favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index favorites_user_idx on favorites (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Messagerie
-- ---------------------------------------------------------------------------

create table conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  buyer_id uuid not null references profiles(id) on delete cascade,
  seller_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Une seule conversation par couple annonce / acheteur
  unique (listing_id, buyer_id),
  check (buyer_id <> seller_id)
);

create index conversations_buyer_idx on conversations (buyer_id, updated_at desc);
create index conversations_seller_idx on conversations (seller_id, updated_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  -- Offre de prix attachée au message, le cas échéant
  offer numeric(10, 2) check (offer > 0),
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on messages (conversation_id, created_at);

-- Suivi de lecture par participant
create table conversation_reads (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- Remonte la conversation dès qu'un message arrive.
create function touch_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update conversations set updated_at = now() where id = new.conversation_id;
  insert into conversation_reads (conversation_id, user_id, read_at)
  values (new.conversation_id, new.sender_id, now())
  on conflict (conversation_id, user_id) do update set read_at = now();
  return new;
end;
$$;

create trigger on_message_created
  after insert on messages
  for each row execute function touch_conversation();

-- ---------------------------------------------------------------------------
-- Horodatage
-- ---------------------------------------------------------------------------

create function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();
create trigger listings_touch before update on listings
  for each row execute function touch_updated_at();

-- Compteur de vues : passe outre la RLS, sans permettre d'éditer l'annonce.
create function increment_listing_views(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update listings set views = views + 1 where id = target and status <> 'draft';
end;
$$;

-- ---------------------------------------------------------------------------
-- Sécurité au niveau ligne
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table listings enable row level security;
alter table listing_images enable row level security;
alter table favorites enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table conversation_reads enable row level security;

-- Profils : visibles de tous, modifiables par leur titulaire uniquement.
create policy profiles_read on profiles for select using (true);
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Annonces : publiées visibles de tous, brouillons réservés au vendeur.
create policy listings_read on listings for select
  using (status <> 'draft' or seller_id = auth.uid());
create policy listings_insert on listings for insert
  with check (seller_id = auth.uid());
create policy listings_update on listings for update
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());
create policy listings_delete on listings for delete
  using (seller_id = auth.uid());

create policy listing_images_read on listing_images for select
  using (
    exists (
      select 1 from listings l
      where l.id = listing_id and (l.status <> 'draft' or l.seller_id = auth.uid())
    )
  );
create policy listing_images_write on listing_images for all
  using (exists (select 1 from listings l where l.id = listing_id and l.seller_id = auth.uid()))
  with check (exists (select 1 from listings l where l.id = listing_id and l.seller_id = auth.uid()));

-- Favoris : strictement privés.
create policy favorites_own on favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Conversations : réservées aux deux participants.
create policy conversations_read on conversations for select
  using (buyer_id = auth.uid() or seller_id = auth.uid());
create policy conversations_insert on conversations for insert
  with check (
    buyer_id = auth.uid()
    and exists (select 1 from listings l where l.id = listing_id and l.seller_id = seller_id)
  );

create policy messages_read on messages for select
  using (
    exists (
      select 1 from conversations c
      where c.id = conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );
create policy messages_insert on messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversations c
      where c.id = conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );

create policy conversation_reads_own on conversation_reads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Photos d'annonces
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do nothing;

-- Chaque photo est rangée sous « <user_id>/... » : le premier segment du chemin
-- sert de contrôle d'accès en écriture.
create policy listing_photos_read on storage.objects for select
  using (bucket_id = 'listing-photos');
create policy listing_photos_insert on storage.objects for insert
  with check (
    bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy listing_photos_delete on storage.objects for delete
  using (
    bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
