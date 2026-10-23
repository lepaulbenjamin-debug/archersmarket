-- Suivre un vendeur.
--
-- Un archer qui vend bien — du matériel décrit avec soin, des photos nettes,
-- des envois sans histoire — finit par avoir des acheteurs qui reviennent.
-- Les suivre leur permet d'être prévenus quand il publie, plutôt que de
-- repasser sur son profil au hasard.
--
-- Trois règles, chacune tenue ici et non dans l'application, parce que l'API
-- reste ouverte à qui l'écrit à la main.

-- ---------------------------------------------------------------------------
-- 1. Qui suit qui ne regarde que l'abonné
--
-- Comme les favoris : chacun ne lit que ses propres abonnements. Un vendeur
-- sait combien de personnes le suivent, jamais lesquelles. Le nombre, lui,
-- est public — il dit quelque chose de la confiance qu'on lui fait.
-- ---------------------------------------------------------------------------

create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  seller_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, seller_id),
  check (follower_id <> seller_id)
);

create index follows_seller_idx on follows (seller_id, created_at);

alter table follows enable row level security;

create policy follows_read_own on follows for select
  using (follower_id = auth.uid());

create policy follows_delete_own on follows for delete
  using (follower_id = auth.uid());

-- On ne suit pas quelqu'un avec qui le contact est coupé, dans un sens ou
-- dans l'autre. `blocks` n'est lisible que par celui qui bloque : une
-- politique qui la lirait elle-même ne verrait pas « ce vendeur m'a bloqué ».
-- D'où `is_blocked_between`, qui la lit avec les droits nécessaires (0007).
create policy follows_insert_own on follows for insert
  to authenticated
  with check (
    follower_id = auth.uid()
    and not is_blocked_between(follower_id, seller_id)
  );

-- Un compte suspendu ne s'abonne plus à personne.
create trigger follows_refuse_suspended
  before insert on follows
  for each row execute function refuse_if_suspended();

comment on table follows is
  'Abonnements aux vendeurs. Chacun ne lit que les siens ; le nombre d''abonnés d''un vendeur passe par follower_count().';

-- Le nombre d'abonnés d'un vendeur, lisible par tous. Une fonction plutôt
-- qu'une colonne du profil : l'application peut ainsi s'en passer si elle est
-- en avance sur la base, sans que le chargement des profils échoue.
create function follower_count(seller uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from follows where seller_id = seller;
$$;

revoke all on function follower_count(uuid) from public;
grant execute on function follower_count(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Bloquer, c'est aussi se désabonner
--
-- Sinon, un abonnement d'avant le blocage continuerait d'envoyer des
-- notifications — et resterait affiché dans la liste de celui qui a bloqué.
-- ---------------------------------------------------------------------------

create function unfollow_on_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from follows
   where (follower_id = new.blocker_id and seller_id = new.blocked_id)
      or (follower_id = new.blocked_id and seller_id = new.blocker_id);
  return null;
end;
$$;

create trigger blocks_unfollow
  after insert on blocks
  for each row execute function unfollow_on_block();

-- ---------------------------------------------------------------------------
-- 3. Une nouvelle annonce prévient les abonnés
--
-- Même circuit que les alertes de recherche (0030, 0031) : `send_push`, un
-- plafond, et une trace dans `alert_failures` quand un envoi rate — une
-- notification muette ne se distingue pas d'un vendeur qui ne publie plus.
--
-- « Nouvelle » veut dire publiée : à la création, ou à la sortie d'un
-- brouillon. Remettre en ligne une annonce vendue n'est pas une nouveauté, et
-- une modification non plus — la colonne `status` n'est d'ailleurs pas dans
-- la requête de modification (voir `updateListing`).
-- ---------------------------------------------------------------------------

/** Des abonnés ont choisi d'être prévenus : le plafond est plus haut que pour les alertes. */
create function follow_fanout_limit() returns integer
language sql immutable as $$ select 500; $$;

create function notify_followers() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  abonne uuid;
  vendeur text;
begin
  if new.status <> 'active' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status is distinct from 'draft' then
    return null;
  end if;

  select name into vendeur from profiles where id = new.seller_id;

  for abonne in
    select f.follower_id from follows f
     where f.seller_id = new.seller_id
       and not is_blocked_between(f.follower_id, new.seller_id)
       -- Celui qu'une de ses recherches sauvegardées prévient déjà de cette
       -- annonce ne la reçoit pas deux fois.
       and not exists (
         select 1 from saved_searches s
          where s.user_id = f.follower_id
            and s.notify
            and listing_matches_search(new, s)
       )
     order by f.created_at
     limit follow_fanout_limit()
  loop
    -- Seul l'envoi peut légitimement échouer : il sort de la base. Un envoi
    -- raté ne doit pas emporter les suivants.
    begin
      perform send_push(
        abonne,
        format('%s a publié une annonce', coalesce(vendeur, 'Un vendeur que vous suivez')),
        format('%s — %s €', new.title, trim(to_char(new.price, 'FM999999990.99'))),
        jsonb_build_object('type', 'followed_seller', 'listingId', new.id, 'sellerId', new.seller_id)
      );
    exception when others then
      insert into alert_failures (listing_id, detail)
      values (new.id, format('abonné %s : %s', abonne, sqlerrm));
    end;
  end loop;

  return null;
exception when others then
  -- Prévenir n'est jamais assez important pour empêcher une publication.
  insert into alert_failures (listing_id, detail) values (new.id, 'abonnements : ' || sqlerrm);
  return null;
end;
$$;

create trigger listings_notify_followers
  after insert or update of status on listings
  for each row execute function notify_followers();

-- Les privilèges par défaut de Supabase rendent exécutable par tous toute
-- fonction créée dans `public`. Une fonction de déclencheur n'a aucune raison
-- d'être appelable de l'extérieur.
revoke execute on function notify_followers() from public, anon, authenticated;
revoke execute on function unfollow_on_block() from public, anon, authenticated;
