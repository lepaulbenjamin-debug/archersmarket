-- Alertes sur recherche, et compte des favoris.
--
-- Deux choses qui se ressemblent peu mais tiennent au même besoin : savoir ce
-- qui bouge. L'acheteur veut être prévenu quand la poignée qu'il guette
-- apparaît ; le vendeur veut savoir si son annonce intéresse.

-- ---------------------------------------------------------------------------
-- Combien de personnes ont mis en favori
--
-- Un compteur porté par l'annonce, tenu par déclencheur. On ne peut pas
-- compter la table `favorites` depuis l'application : chacun n'y voit que ses
-- propres lignes, et c'est très bien ainsi — qui a mis quoi en favori ne
-- regarde personne.
-- ---------------------------------------------------------------------------

alter table listings add column favorites_count integer not null default 0;

comment on column listings.favorites_count is
  'Nombre de membres ayant mis l''annonce en favori. Tenu par déclencheur.';

create function refresh_favorites_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update listings set favorites_count = favorites_count + 1 where id = new.listing_id;
  elsif tg_op = 'DELETE' then
    update listings set favorites_count = greatest(0, favorites_count - 1)
     where id = old.listing_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger favorites_count_changed
  after insert or delete on favorites
  for each row execute function refresh_favorites_count();

-- Remise à niveau de l'existant.
update listings l set favorites_count = coalesce(
  (select count(*) from favorites f where f.listing_id = l.id), 0);

-- Le compteur n'est pas dans la liste des colonnes que l'application peut
-- écrire (migration 0010) : il reste donc en lecture seule, comme les vues.

-- ---------------------------------------------------------------------------
-- Recherches enregistrées
--
-- On range les critères tels que l'écran de recherche les manipule, plutôt
-- qu'un texte libre : c'est ce qui permet de savoir, à la publication d'une
-- annonce, si elle correspond — sans rejouer une recherche pour chaque membre.
-- ---------------------------------------------------------------------------

create table saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,

  -- Le nom que le membre lui donne, ou celui qu'on déduit de ses critères.
  label text not null check (char_length(trim(label)) between 1 and 60),

  query text,
  categories listing_category[],
  conditions listing_condition[],
  brands text[],
  handedness handedness,
  min_price numeric(10, 2) check (min_price is null or min_price >= 0),
  max_price numeric(10, 2) check (max_price is null or max_price >= 0),
  min_draw_weight numeric(4, 1),
  max_draw_weight numeric(4, 1),
  shipping_only boolean not null default false,

  /** Une alerte peut être mise en veille sans être supprimée. */
  notify boolean not null default true,

  created_at timestamptz not null default now(),
  last_notified_at timestamptz,

  constraint saved_searches_prices check (
    min_price is null or max_price is null or min_price <= max_price
  )
);

create index saved_searches_user_idx on saved_searches (user_id, created_at desc);
-- Ne parcourir que les alertes actives à chaque publication.
create index saved_searches_active_idx on saved_searches (notify) where notify;

alter table saved_searches enable row level security;

create policy saved_searches_read on saved_searches for select
  using (user_id = auth.uid());
create policy saved_searches_insert on saved_searches for insert
  with check (user_id = auth.uid());
create policy saved_searches_update on saved_searches for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy saved_searches_delete on saved_searches for delete
  using (user_id = auth.uid());

-- Une alerte par membre et par jeu de critères suffit : dix alertes
-- identiques enverraient dix notifications pour la même annonce.
create unique index saved_searches_unique on saved_searches (
  user_id,
  coalesce(lower(trim(query)), ''),
  coalesce(categories, '{}'),
  coalesce(conditions, '{}'),
  coalesce(brands, '{}'),
  coalesce(handedness, 'na'),
  coalesce(min_price, -1),
  coalesce(max_price, -1),
  shipping_only
);

-- ---------------------------------------------------------------------------
-- La correspondance
--
-- Un tableau de critères vide veut dire « peu importe », jamais « aucun ».
-- C'est la nuance qui décide de tout : traiter un filtre vide comme excluant
-- rendrait toutes les alertes muettes.
-- ---------------------------------------------------------------------------

create function listing_matches_search(annonce listings, recherche saved_searches)
returns boolean
language sql stable as $$
  select
        (recherche.categories is null or cardinality(recherche.categories) = 0
         or annonce.category = any (recherche.categories))
    and (recherche.conditions is null or cardinality(recherche.conditions) = 0
         or annonce.condition = any (recherche.conditions))
    and (recherche.brands is null or cardinality(recherche.brands) = 0
         or lower(annonce.brand) = any (select lower(b) from unnest(recherche.brands) b))
    and (recherche.handedness is null or recherche.handedness = 'na'
         or annonce.hand = recherche.handedness or annonce.hand = 'na')
    and (recherche.min_price is null or annonce.price >= recherche.min_price)
    and (recherche.max_price is null or annonce.price <= recherche.max_price)
    and (recherche.min_draw_weight is null
         or (annonce.draw_weight is not null and annonce.draw_weight >= recherche.min_draw_weight))
    and (recherche.max_draw_weight is null
         or (annonce.draw_weight is not null and annonce.draw_weight <= recherche.max_draw_weight))
    and (not recherche.shipping_only or annonce.shipping)
    and (recherche.query is null or trim(recherche.query) = ''
         or annonce.search_vector @@ websearch_to_tsquery('french', recherche.query));
$$;

comment on function listing_matches_search is
  'Une annonce répond-elle aux critères d''une alerte ? Un critère vide n''exclut rien.';

-- ---------------------------------------------------------------------------
-- Prévenir
-- ---------------------------------------------------------------------------

/** Au-delà, on s'arrête : une annonce ne doit pas réveiller la France entière. */
create function alert_fanout_limit() returns integer
language sql immutable as $$ select 200; $$;

create function notify_saved_searches() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  alerte record;
  envoyees integer := 0;
begin
  -- Une annonce qui n'est pas en ligne n'intéresse personne.
  if new.status <> 'active' then
    return null;
  end if;

  for alerte in
    select s.* from saved_searches s
     where s.notify
       -- On ne prévient pas quelqu'un de sa propre annonce.
       and s.user_id <> new.seller_id
       -- Ni un membre qui a coupé le contact avec ce vendeur.
       and not exists (
         select 1 from blocks b
          where (b.blocker_id = s.user_id and b.blocked_id = new.seller_id)
             or (b.blocker_id = new.seller_id and b.blocked_id = s.user_id)
       )
     order by s.created_at
     limit alert_fanout_limit()
  loop
    if listing_matches_search(new, alerte) then
      perform send_push(
        alerte.user_id,
        alerte.label,
        format('%s — %s €', new.title, trim(to_char(new.price, 'FM999999990.99'))),
        jsonb_build_object('type', 'saved_search', 'listingId', new.id, 'searchId', alerte.id)
      );
      update saved_searches set last_notified_at = now() where id = alerte.id;
      envoyees := envoyees + 1;
    end if;
  end loop;

  return null;
exception when others then
  -- Prévenir n'est jamais assez important pour empêcher une publication.
  return null;
end;
$$;

create trigger listings_notify_searches
  after insert on listings
  for each row execute function notify_saved_searches();

comment on function notify_saved_searches is
  'Prévient les membres dont une alerte correspond à l''annonce publiée.';
