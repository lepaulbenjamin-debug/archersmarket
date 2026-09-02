-- ---------------------------------------------------------------------------
-- Les recherches : dire ce qu'on cherche, plutôt que d'attendre que ça paraisse
--
-- Une alerte (`saved_searches`) est un filtre lisible par la machine, privé,
-- qui attend. Une recherche est une phrase adressée à des humains — « des
-- branches 68 pouces en 30 livres, du Win&Win ou du Uukha, jusqu'à 250 € » —
-- et elle est publique. Les deux se ressemblent de loin ; les confondre
-- abîmerait les deux.
--
-- La recherche porte quand même les champs structurés de l'alerte. Pas pour
-- filtrer un affichage, mais parce que c'est la seule chose qui permet de ne
-- pas réveiller tout le monde à chaque demande : un volontaire dit quelles
-- catégories l'intéressent, et il ne reçoit que celles-là.
-- ---------------------------------------------------------------------------

create type wanted_status as enum ('open', 'found', 'closed');

create table wanted_requests (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references profiles (id) on delete cascade,

  -- Ce que la personne écrit, et ce que la machine peut en faire.
  title text not null check (length(trim(title)) between 3 and 90),
  detail text check (detail is null or length(detail) <= 700),
  category listing_category not null,
  brands text[],
  handedness handedness,
  min_draw_weight numeric(4, 1),
  max_draw_weight numeric(4, 1),
  /** Le budget, plafond seul : personne ne cherche « au moins cher ». */
  max_price numeric(10, 2) check (max_price is null or max_price >= 0),

  status wanted_status not null default 'open',

  /**
   * Une recherche expire.
   *
   * Sans cela le fil se remplit de demandes satisfaites il y a six mois, que
   * personne ne pense à fermer, et le vendeur qui répond tombe sur un silence.
   * Trente jours, renouvelables — c'est plus court que la patience de
   * quelqu'un qui cherche vraiment, donc le renouvellement est un signal.
   */
  expires_at timestamptz not null default now() + interval '30 days',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint wanted_draw_weights check (
    min_draw_weight is null or max_draw_weight is null
    or min_draw_weight <= max_draw_weight
  )
);

create index wanted_open_idx on wanted_requests (created_at desc)
  where status = 'open';
create index wanted_seeker_idx on wanted_requests (seeker_id, created_at desc);
create index wanted_category_idx on wanted_requests (category)
  where status = 'open';

comment on table wanted_requests is
  'Demandes de matériel recherché, visibles de tous les membres.';

-- ---------------------------------------------------------------------------
-- Les volontaires
--
-- Personne ne reçoit rien sans l'avoir demandé, et la question n'est pas
-- « voulez-vous des notifications » mais « lesquelles ». Un tableau vide veut
-- dire toutes les catégories : c'est le mode « je veux tout voir », celui du
-- groupe Facebook, et il reste possible pour qui le souhaite.
-- ---------------------------------------------------------------------------

create table wanted_watchers (
  user_id uuid primary key references profiles (id) on delete cascade,
  categories listing_category[] not null default '{}',
  created_at timestamptz not null default now()
);

comment on column wanted_watchers.categories is
  'Catégories suivies. Tableau vide = toutes.';

-- ---------------------------------------------------------------------------
-- Combien de recherches ouvertes par membre
--
-- Trois. Quelqu'un qui en a trois en cours cherche vraiment ; quelqu'un qui en
-- a vingt fait du bruit. La limite est une fonction pour se relire, et se
-- changer sans migration de table.
-- ---------------------------------------------------------------------------

create function wanted_open_limit() returns integer
language sql immutable as $$ select 3; $$;

/**
 * Combien de recherches ouvertes j'ai en cours.
 *
 * En `security definer`, et ce n'est pas un raffinement : la politique
 * d'insertion s'en sert pour faire respecter la limite, or compter les lignes
 * de `wanted_requests` depuis une politique posée sur `wanted_requests`
 * relance la politique, qui relance le compte. Postgres s'en aperçoit et
 * refuse tout avec « infinite recursion detected in policy ». La fonction
 * lit la table avec les droits de son propriétaire, hors politique, et la
 * boucle est coupée.
 *
 * Sans paramètre, exprès : `auth.uid()` désigne l'appelant et rien d'autre,
 * là où un argument permettrait de sonder le compte des voisins.
 */
create function wanted_open_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from wanted_requests
   where seeker_id = auth.uid() and status = 'open' and expires_at > now();
$$;

-- ---------------------------------------------------------------------------
-- Sécurité au niveau ligne
-- ---------------------------------------------------------------------------

alter table wanted_requests enable row level security;
alter table wanted_watchers enable row level security;

/**
 * Lecture : les recherches ouvertes et non expirées sont publiques entre
 * membres — c'est tout l'intérêt. Chacun voit en plus les siennes, quel que
 * soit leur état, pour pouvoir les rouvrir ou les relire.
 *
 * Un membre bloqué disparaît des deux côtés, comme partout ailleurs.
 */
create policy wanted_read on wanted_requests for select
  to authenticated
  using (
    seeker_id = auth.uid()
    or (
      status = 'open'
      and expires_at > now()
      and not exists (
        select 1 from blocks b
         where (b.blocker_id = auth.uid() and b.blocked_id = wanted_requests.seeker_id)
            or (b.blocker_id = wanted_requests.seeker_id and b.blocked_id = auth.uid())
      )
    )
  );

/**
 * Écriture : la sienne, et pas plus de trois ouvertes à la fois. La limite est
 * dans la politique et non dans l'application : c'est le seul endroit qu'on ne
 * peut pas contourner en appelant l'API directement.
 */
create policy wanted_insert on wanted_requests for insert
  to authenticated
  with check (
    seeker_id = auth.uid()
    and wanted_open_count() < wanted_open_limit()
  );

create policy wanted_update on wanted_requests for update
  to authenticated
  using (seeker_id = auth.uid()) with check (seeker_id = auth.uid());

create policy wanted_delete on wanted_requests for delete
  to authenticated
  using (seeker_id = auth.uid());

create policy watchers_read on wanted_watchers for select
  to authenticated using (user_id = auth.uid());
create policy watchers_insert on wanted_watchers for insert
  to authenticated with check (user_id = auth.uid());
create policy watchers_update on wanted_watchers for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy watchers_delete on wanted_watchers for delete
  to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- La correspondance, dans l'autre sens
--
-- `listing_matches_search` répond « cette annonce va-t-elle à cette alerte ».
-- Ici on demande « cette annonce répond-elle à cette recherche », ce qui n'est
-- pas la même question : une recherche n'a pas de plancher de prix, pas de
-- filtre d'état, et son texte libre décrit une intention plutôt qu'une requête.
-- Un critère absent n'exclut rien, règle qui vaut ici comme là-bas.
-- ---------------------------------------------------------------------------

create function listing_matches_wanted(annonce listings, demande wanted_requests)
returns boolean
language sql stable as $$
  select
        annonce.category = demande.category
    and (demande.brands is null or cardinality(demande.brands) = 0
         or lower(annonce.brand) = any (select lower(b) from unnest(demande.brands) b))
    and (demande.handedness is null or demande.handedness = 'na'
         or annonce.hand = demande.handedness or annonce.hand = 'na')
    and (demande.max_price is null or annonce.price <= demande.max_price)
    and (demande.min_draw_weight is null
         or (annonce.draw_weight is not null and annonce.draw_weight >= demande.min_draw_weight))
    and (demande.max_draw_weight is null
         or (annonce.draw_weight is not null and annonce.draw_weight <= demande.max_draw_weight));
$$;

comment on function listing_matches_wanted is
  'Cette annonce répond-elle à cette recherche ? Un critère absent n''exclut rien.';

-- ---------------------------------------------------------------------------
-- Ce qui existe déjà, tout de suite
--
-- Le moment de plus forte valeur est celui où la recherche vient d'être
-- écrite : si trois annonces y répondent déjà, il faut le dire là, et non
-- attendre qu'une quatrième paraisse. La fonction est `security definer` parce
-- qu'elle croise des annonces de tous les vendeurs.
-- ---------------------------------------------------------------------------

create function wanted_matches(wanted_id uuid)
returns setof listings
language plpgsql stable security definer set search_path = public as $$
declare
  moi uuid := auth.uid();
  demande wanted_requests%rowtype;
begin
  if moi is null then
    raise exception 'Connexion requise.';
  end if;

  select * into demande from wanted_requests w
   where w.id = wanted_matches.wanted_id
     and (w.seeker_id = moi or (w.status = 'open' and w.expires_at > now()));
  if demande.id is null then
    return;
  end if;

  return query
    select l.* from listings l
     where l.status = 'active'
       -- Se proposer à soi-même n'apprend rien à personne.
       and l.seller_id <> demande.seeker_id
       and not exists (
         select 1 from blocks b
          where (b.blocker_id = moi and b.blocked_id = l.seller_id)
             or (b.blocker_id = l.seller_id and b.blocked_id = moi)
       )
       and listing_matches_wanted(l, demande)
     order by l.price
     limit 20;
end;
$$;

revoke execute on function wanted_matches(uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- Prévenir les volontaires qu'on cherche quelque chose
--
-- Calqué sur `notify_saved_searches`, et pour les mêmes raisons : le plafond
-- d'envoi empêche une demande de réveiller la France entière, les blocages
-- sont respectés, et un envoi qui échoue est consigné sans emporter les
-- suivants. Prévenir n'est jamais assez important pour empêcher d'écrire.
-- ---------------------------------------------------------------------------

create function notify_wanted_watchers() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  volontaire wanted_watchers%rowtype;
  qui text;
begin
  if new.status <> 'open' then
    return null;
  end if;

  select coalesce(p.name, p.handle, 'Un archer') into qui
    from profiles p where p.id = new.seeker_id;

  for volontaire in
    select w.* from wanted_watchers w
     where w.user_id <> new.seeker_id
       -- Tableau vide : toutes les catégories.
       and (cardinality(w.categories) = 0 or new.category = any (w.categories))
       and not exists (
         select 1 from blocks b
          where (b.blocker_id = w.user_id and b.blocked_id = new.seeker_id)
             or (b.blocker_id = new.seeker_id and b.blocked_id = w.user_id)
       )
     order by w.created_at
     limit alert_fanout_limit()
  loop
    begin
      perform send_push(
        volontaire.user_id,
        format('%s cherche', qui),
        new.title,
        jsonb_build_object('type', 'wanted', 'wantedId', new.id)
      );
    exception when others then
      insert into alert_failures (listing_id, detail)
      values (null, format('recherche %s vers %s : %s', new.id, volontaire.user_id, sqlerrm));
    end;
  end loop;

  return null;
exception when others then
  insert into alert_failures (listing_id, detail)
  values (null, format('recherche %s : %s', new.id, sqlerrm));
  return null;
end;
$$;

create trigger wanted_notify_watchers
  after insert on wanted_requests
  for each row execute function notify_wanted_watchers();

-- ---------------------------------------------------------------------------
-- Et le retour : prévenir celui qui cherche quand ça paraît
--
-- Un déclencheur de plus sur `listings` plutôt qu'une extension de
-- `notify_saved_searches` : les deux n'ont ni le même public, ni la même
-- correspondance, et les mêler rendrait chacun illisible. Une annonce qui
-- répond à une alerte et à une recherche produit deux notifications à deux
-- personnes différentes, ce qui est le comportement attendu.
-- ---------------------------------------------------------------------------

create function notify_wanted_seekers() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  demande wanted_requests%rowtype;
begin
  if new.status <> 'active' then
    return null;
  end if;

  for demande in
    select w.* from wanted_requests w
     where w.status = 'open'
       and w.expires_at > now()
       and w.category = new.category
       and w.seeker_id <> new.seller_id
       and not exists (
         select 1 from blocks b
          where (b.blocker_id = w.seeker_id and b.blocked_id = new.seller_id)
             or (b.blocker_id = new.seller_id and b.blocked_id = w.seeker_id)
       )
     order by w.created_at
     limit alert_fanout_limit()
  loop
    if listing_matches_wanted(new, demande) then
      begin
        perform send_push(
          demande.seeker_id,
          'Ce que vous cherchez vient de paraître',
          format('%s — %s €', new.title, trim(to_char(new.price, 'FM999999990.99'))),
          jsonb_build_object('type', 'wanted_match', 'listingId', new.id, 'wantedId', demande.id)
        );
      exception when others then
        insert into alert_failures (listing_id, detail)
        values (new.id, format('recherche %s : %s', demande.id, sqlerrm));
      end;
    end if;
  end loop;

  return null;
exception when others then
  insert into alert_failures (listing_id, detail) values (new.id, sqlerrm);
  return null;
end;
$$;

create trigger listings_notify_wanted
  after insert or update of status on listings
  for each row execute function notify_wanted_seekers();

-- ---------------------------------------------------------------------------
-- Le fil, tel que l'écran le lit
--
-- Une vue plutôt qu'une jointure côté application : le nom de celui qui
-- cherche et le nombre d'annonces qui répondent déjà tiennent en une requête,
-- et la politique de lecture de `wanted_requests` s'applique à travers elle.
-- ---------------------------------------------------------------------------

create view wanted_feed
with (security_invoker = true) as
  select
    w.id, w.seeker_id, w.title, w.detail, w.category, w.brands, w.handedness,
    w.min_draw_weight, w.max_draw_weight, w.max_price, w.status,
    w.expires_at, w.created_at,
    coalesce(p.name, p.handle, 'Archer') as seeker_name,
    p.handle as seeker_handle,
    p.city as seeker_city,
    p.avatar_color as seeker_color
  from wanted_requests w
  join profiles p on p.id = w.seeker_id;

comment on view wanted_feed is
  'Les recherches avec l''identité publique du demandeur. security_invoker : '
  'la politique de wanted_requests décide de ce qui est visible.';

-- ---------------------------------------------------------------------------
-- Retirer ce que Supabase accorde tout seul
--
-- `alter default privileges` donne l'exécution à `anon, authenticated,
-- service_role` à toute fonction créée dans `public`. Les deux fonctions de
-- déclencheur ci-dessus sont `security definer` et appellent `send_push` :
-- vérification faite, Postgres refuse de les exécuter hors déclencheur
-- (« trigger functions can only be called as triggers »), donc rien n'est
-- exploitable. Mais un droit ouvert oblige à refaire cette vérification à
-- chaque relecture, alors qu'un droit retiré clôt la question.
--
-- `notify_saved_searches` est dans le même cas depuis la migration 0031. On la
-- ferme aussi : laisser deux fonctions jumelles avec deux réglages différents
-- est le meilleur moyen de se tromper plus tard sur laquelle est la bonne.
revoke execute on function wanted_open_count() from public, anon;
revoke execute on function notify_wanted_watchers() from public, anon, authenticated;
revoke execute on function notify_wanted_seekers() from public, anon, authenticated;
revoke execute on function notify_saved_searches() from public, anon, authenticated;
