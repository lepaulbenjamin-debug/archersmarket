-- L'adresse d'où part le colis.
--
-- Une étiquette porte toujours deux adresses. Celle de l'acheteur est
-- recopiée sur la commande ; celle du vendeur manquait. Elle ne va pas sur le
-- profil, qui est public : une adresse postale ne se lit que par son
-- propriétaire, et par la fonction qui achète l'étiquette.

create table seller_addresses (
  user_id uuid primary key references profiles(id) on delete cascade,

  full_name text not null check (char_length(trim(full_name)) >= 3),
  address text not null check (char_length(trim(address)) >= 5),
  zip text not null check (zip ~ '^[0-9A-Za-z -]{4,10}$'),
  city text not null check (char_length(trim(city)) >= 2),
  country text not null default 'FR' check (country ~ '^[A-Z]{2}$'),
  -- Les transporteurs exigent un téléphone joignable pour l'enlèvement.
  phone text not null check (phone ~ '^[+0-9 ().-]{6,20}$'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table seller_addresses enable row level security;

-- Chacun ne voit et n'écrit que la sienne.
create policy seller_addresses_read on seller_addresses for select
  using (user_id = auth.uid());
create policy seller_addresses_insert on seller_addresses for insert
  with check (user_id = auth.uid());
create policy seller_addresses_update on seller_addresses for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy seller_addresses_delete on seller_addresses for delete
  using (user_id = auth.uid());

comment on table seller_addresses is
  'Adresse d''expédition du vendeur, privée : sert à éditer l''étiquette.';
