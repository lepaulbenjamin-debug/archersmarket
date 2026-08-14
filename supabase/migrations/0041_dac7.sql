-- DAC7 : ce que la plateforme doit savoir de ses vendeurs, et rien avant.
--
-- La directive 2021/514, transposée aux articles 1649 ter A et suivants du CGI,
-- oblige l'opérateur — nous — à déclarer chaque année ses vendeurs à
-- l'administration fiscale. Ce n'est pas de la comptabilité : c'est une
-- collecte de données que la plateforme ne faisait pas.
--
-- Deux dates commandent tout. La diligence doit être bouclée au 31 décembre de
-- l'année déclarée, et la déclaration déposée au 31 janvier suivant. Un numéro
-- fiscal ne se réclame pas à un vendeur parti six mois plus tôt : ce qui n'est
-- pas collecté au fil de l'eau est perdu.
--
-- Mais le seuil épargne l'immense majorité. Un vendeur de biens reste hors
-- déclaration tant qu'il fait moins de trente ventes ET deux mille euros au
-- plus dans l'année. Réclamer un NIF à l'inscription ferait fuir tout le monde
-- pour rien ; on ne demande donc qu'à ceux qui approchent, et on ne bloque le
-- virement qu'après relances.
--
-- Une ambiguïté est laissée ouverte plutôt que tranchée en silence : la remise
-- en main propre. L'argent n'y transite pas par nous, nous n'en connaissons
-- que le prix affiché. Le rapport la compte à part, et c'est à la déclaration
-- de décider si elle entre.

-- ---------------------------------------------------------------------------
-- Les seuils, écrits une fois
-- ---------------------------------------------------------------------------

create function dac7_seuil_ventes() returns integer
language sql immutable as $$ select 30; $$;

/** Deux mille euros, en centimes comme partout ailleurs. */
create function dac7_seuil_montant() returns integer
language sql immutable as $$ select 200000; $$;

/** Le délai laissé au vendeur après la première relance, avant retenue. */
create function dac7_delai_jours() returns integer
language sql immutable as $$ select 45; $$;

comment on function dac7_seuil_ventes is
  'Sous trente ventes ET deux mille euros, un vendeur de biens n''est pas déclarable.';

-- ---------------------------------------------------------------------------
-- Ce qu'on collecte, et de qui
-- ---------------------------------------------------------------------------

create table seller_tax_details (
  user_id uuid primary key references profiles(id) on delete cascade,

  -- Un professionnel et un particulier ne déclarent pas les mêmes champs.
  is_business boolean not null default false,

  -- Particulier : nom, date et lieu de naissance. Le lieu n'est exigé qu'à
  -- défaut de numéro fiscal, mais le demander coûte une ligne et évite d'y
  -- revenir.
  birth_date date,
  birth_place text,

  -- Entreprise : raison sociale et immatriculation.
  legal_name text,
  business_number text,
  vat_number text,

  -- Numéro d'identification fiscale et État qui l'a délivré.
  tin text,
  tin_country text default 'FR',

  -- L'adresse principale. Distincte de `seller_addresses`, qui est l'adresse
  -- d'expédition : un vendeur qui ne fait que de la main propre n'en a pas,
  -- et rien ne dit que celle du colis soit son domicile.
  address text,
  zip text,
  city text,
  country text default 'FR',

  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tax_pays_iso check (tin_country is null or tin_country ~ '^[A-Z]{2}$'),
  constraint tax_naissance_plausible check (
    birth_date is null or birth_date between '1900-01-01' and current_date - interval '18 years'
  )
);

comment on table seller_tax_details is
  'Données DAC7 des vendeurs déclarables. Jamais demandées avant le seuil.';

alter table seller_tax_details enable row level security;

-- Le vendeur écrit et relit les siennes. Personne d'autre ne les voit — pas
-- même un autre vendeur, pas même par une jointure : c'est la donnée la plus
-- sensible de la base après les adresses.
create policy seller_tax_read on seller_tax_details for select
  using (user_id = auth.uid() or is_moderator());
create policy seller_tax_insert on seller_tax_details for insert
  with check (user_id = auth.uid());
create policy seller_tax_update on seller_tax_details for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Pas d'effacement : une donnée déclarée doit rester justifiable. La
-- suppression du compte l'emporte en cascade, ce qui est le seul cas légitime.

create trigger seller_tax_details_touch
  before update on seller_tax_details
  for each row execute function touch_updated_at();

/**
 * Le dossier d'un vendeur est-il complet ?
 *
 * Écrite comme une fonction et non comme une contrainte : un vendeur doit
 * pouvoir enregistrer un dossier partiel et revenir le finir.
 */
create function dac7_complet(details seller_tax_details) returns boolean
language sql immutable as $$
  select details.user_id is not null
     and coalesce(details.tin, '') <> ''
     and coalesce(details.tin_country, '') <> ''
     and coalesce(details.address, '') <> ''
     and coalesce(details.zip, '') <> ''
     and coalesce(details.city, '') <> ''
     and coalesce(details.country, '') <> ''
     and case when details.is_business
              then coalesce(details.legal_name, '') <> ''
               and coalesce(details.business_number, '') <> ''
              else details.birth_date is not null
         end;
$$;

-- ---------------------------------------------------------------------------
-- Le décompte
-- ---------------------------------------------------------------------------

/**
 * Les ventes d'un vendeur sur une année, ventilées par trimestre.
 *
 * La contrepartie retenue est ce que le vendeur touche — le prix de l'objet —
 * et les frais sont donnés à part, comme la déclaration les veut. Le trimestre
 * est celui du versement et non celui de la commande : c'est la date à
 * laquelle la somme lui a été créditée qui compte.
 *
 * `escrow` et `direct` sont séparés à dessein. Le premier est de l'argent que
 * nous avons encaissé puis reversé ; le second n'a jamais transité par nous et
 * nous n'en connaissons que le prix affiché. Les additionner reviendrait à
 * trancher une question qui ne nous appartient pas.
 */
create function dac7_activite(seller uuid, annee integer)
returns table (
  trimestre integer,
  ventes_escrow bigint,
  montant_escrow bigint,
  frais_escrow bigint,
  ventes_direct bigint,
  montant_direct bigint
)
language sql stable security definer set search_path = public as $$
  select
    extract(quarter from coalesce(o.released_at, o.handover_at, o.delivered_at))::integer,
    count(*) filter (where o.payment_mode = 'escrow'),
    coalesce(sum(o.item_amount) filter (where o.payment_mode = 'escrow'), 0),
    coalesce(sum(o.protection_amount) filter (where o.payment_mode = 'escrow'), 0),
    count(*) filter (where o.payment_mode = 'direct'),
    coalesce(sum(o.item_amount) filter (where o.payment_mode = 'direct'), 0)
  from orders o
  where o.seller_id = seller
    and o.status in ('released', 'delivered')
    and coalesce(o.released_at, o.handover_at, o.delivered_at) is not null
    and extract(year from coalesce(o.released_at, o.handover_at, o.delivered_at)) = annee
  group by 1
  order by 1;
$$;

-- Les relances, gardées ici plutôt que dans la table du dossier : une
-- sollicitation n'est pas une donnée fiscale, et un vendeur qui efface son
-- dossier ne doit pas effacer la trace qu'on le lui a demandé.
create table dac7_reminders (
  user_id uuid not null references profiles(id) on delete cascade,
  year integer not null,
  first_asked_at timestamptz not null default now(),
  last_asked_at timestamptz not null default now(),
  times integer not null default 1,
  primary key (user_id, year)
);

alter table dac7_reminders enable row level security;
create policy dac7_reminders_read on dac7_reminders for select
  using (user_id = auth.uid() or is_moderator());

/**
 * Où en est un vendeur par rapport au seuil, cette année.
 *
 * Rendue au vendeur lui-même : c'est ce qui permet à l'application de lui
 * expliquer pourquoi on lui demande son numéro fiscal, plutôt que de le lui
 * réclamer sans raison apparente.
 */
create function dac7_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  moi uuid := auth.uid();
  annee integer := extract(year from current_date);
  ventes bigint;
  montant bigint;
  dossier seller_tax_details;
  relance timestamptz;
begin
  if moi is null then
    raise exception 'Connexion requise.';
  end if;

  select coalesce(sum(a.ventes_escrow + a.ventes_direct), 0),
         coalesce(sum(a.montant_escrow + a.montant_direct), 0)
    into ventes, montant
    from dac7_activite(moi, annee) a;

  select * into dossier from seller_tax_details d where d.user_id = moi;
  select r.first_asked_at into relance from dac7_reminders r where r.user_id = moi and r.year = annee;

  return jsonb_build_object(
    'year', annee,
    'sales', ventes,
    'amount', montant,
    'sales_threshold', dac7_seuil_ventes(),
    'amount_threshold', dac7_seuil_montant(),
    -- Le vendeur est déclarable dès qu'il dépasse l'un OU l'autre : la
    -- dispense exige les deux en dessous.
    'reportable', ventes >= dac7_seuil_ventes() or montant > dac7_seuil_montant(),
    'complete', coalesce(dac7_complet(dossier), false),
    'asked_at', relance,
    'grace_days', dac7_delai_jours()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Les relances, et la retenue qui les suit
-- ---------------------------------------------------------------------------

/**
 * Prévient les vendeurs qui viennent de franchir le seuil.
 *
 * Appelée par le balayage. Relance au plus une fois par semaine : au-delà,
 * c'est du harcèlement et ça se retourne contre nous.
 */
create function dac7_relancer() returns integer
language plpgsql security definer set search_path = public as $$
declare
  vendeur record;
  envoyees integer := 0;
  annee integer := extract(year from current_date);
begin
  for vendeur in
    select o.seller_id as id
      from orders o
     where o.status in ('released', 'delivered')
       and extract(year from coalesce(o.released_at, o.handover_at, o.delivered_at)) = annee
     group by o.seller_id
    having count(*) >= dac7_seuil_ventes()
        or sum(o.item_amount) > dac7_seuil_montant()
  loop
    -- Dossier déjà complet : rien à demander.
    if coalesce((select dac7_complet(d) from seller_tax_details d where d.user_id = vendeur.id), false) then
      continue;
    end if;

    insert into dac7_reminders (user_id, year)
    values (vendeur.id, annee)
    on conflict (user_id, year) do update
      set last_asked_at = now(), times = dac7_reminders.times + 1
      where dac7_reminders.last_asked_at < now() - interval '7 days';

    if found then
      perform send_push(
        vendeur.id,
        'Une formalité pour continuer à vendre',
        'Vos ventes dépassent le seuil à partir duquel la loi nous oblige à vous déclarer. Renseignez votre numéro fiscal dans votre compte.',
        jsonb_build_object('type', 'dac7')
      );
      envoyees := envoyees + 1;
    end if;
  end loop;

  return envoyees;
end;
$$;

/**
 * Faut-il retenir le virement de ce vendeur ?
 *
 * La directive impose de suspendre le paiement ou de fermer le compte d'un
 * vendeur qui ne fournit rien après relances. On retient — on ne ferme pas, et
 * on ne perd rien : la somme reste où elle est et partira au balayage suivant
 * dès que le dossier sera complet.
 *
 * Le délai court à partir de la première demande, pas du franchissement : un
 * vendeur ne doit pas être bloqué avant d'avoir été prévenu.
 */
create function dac7_retenir(seller uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  demande timestamptz;
begin
  select r.first_asked_at into demande
    from dac7_reminders r
   where r.user_id = seller and r.year = extract(year from current_date);

  if demande is null or demande > now() - (dac7_delai_jours() || ' days')::interval then
    return false;
  end if;

  return not coalesce(
    (select dac7_complet(d) from seller_tax_details d where d.user_id = seller), false);
end;
$$;

comment on function dac7_retenir is
  'Vrai si le virement doit attendre : seuil franchi, relancé, et toujours rien.';

-- ---------------------------------------------------------------------------
-- Ce qui part à l'administration, et ce qu'on en dit au vendeur
-- ---------------------------------------------------------------------------

/**
 * Le tableau de la déclaration, réservé à la modération.
 *
 * Une ligne par vendeur et par trimestre, avec le dossier en regard. Les
 * dossiers incomplets y figurent : c'est justement ce qu'il faut voir avant le
 * 31 décembre.
 */
create function dac7_report(annee integer)
returns table (
  seller_id uuid,
  seller_name text,
  is_business boolean,
  legal_name text,
  birth_date date,
  tin text,
  tin_country text,
  business_number text,
  vat_number text,
  address text,
  zip text,
  city text,
  country text,
  dossier_complet boolean,
  trimestre integer,
  ventes_escrow bigint,
  montant_escrow bigint,
  frais_escrow bigint,
  ventes_direct bigint,
  montant_direct bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator() then
    raise exception 'Réservé à la modération.';
  end if;

  return query
    select p.id,
           coalesce(p.name, p.handle),
           coalesce(d.is_business, false),
           d.legal_name, d.birth_date, d.tin, d.tin_country,
           d.business_number, d.vat_number,
           d.address, d.zip, d.city, d.country,
           coalesce(dac7_complet(d), false),
           a.trimestre, a.ventes_escrow, a.montant_escrow, a.frais_escrow,
           a.ventes_direct, a.montant_direct
      from profiles p
      left join seller_tax_details d on d.user_id = p.id
      cross join lateral dac7_activite(p.id, annee) a
     where (select coalesce(sum(x.ventes_escrow + x.ventes_direct), 0)
              from dac7_activite(p.id, annee) x) >= dac7_seuil_ventes()
        or (select coalesce(sum(x.montant_escrow + x.montant_direct), 0)
              from dac7_activite(p.id, annee) x) > dac7_seuil_montant()
     order by 2, a.trimestre;
end;
$$;

/**
 * Ce qui a été déclaré au sujet du vendeur qui demande.
 *
 * L'opérateur doit informer chaque vendeur déclaré des données transmises.
 * Cette fonction est ce que l'écran lui montre — pas un résumé rédigé
 * ailleurs, les mêmes chiffres que ceux du rapport.
 */
create function dac7_statement(annee integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  moi uuid := auth.uid();
begin
  if moi is null then
    raise exception 'Connexion requise.';
  end if;

  return jsonb_build_object(
    'year', annee,
    'quarters', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.trimestre) from dac7_activite(moi, annee) a
    ), '[]'::jsonb),
    'details', (select to_jsonb(d) - 'created_at' - 'updated_at'
                  from seller_tax_details d where d.user_id = moi)
  );
end;
$$;

-- Rien pour PUBLIC ni anon : ces fonctions parlent de données fiscales.
revoke execute on function dac7_activite(uuid, integer), dac7_status(),
  dac7_report(integer), dac7_statement(integer), dac7_retenir(uuid),
  dac7_relancer(), dac7_complet(seller_tax_details), dac7_seuil_ventes(),
  dac7_seuil_montant(), dac7_delai_jours() from public, anon;

-- Et rien à `authenticated` pour les trois qui prennent un vendeur en
-- paramètre ou qui agissent.
--
-- Ce retrait explicite est indispensable et c'est le troisième piège du même
-- genre dans ce projet : Supabase pose un droit par défaut sur le schéma
-- public, `alter default privileges ... grant execute on functions to anon,
-- authenticated, service_role`. Toute fonction naît donc ouverte à
-- `authenticated`, et retirer PUBLIC n'y change rien — le droit est nominatif.
-- Sans ces deux lignes, n'importe quel membre lisait le chiffre d'affaires de
-- n'importe qui par `dac7_activite`, et pouvait déclencher les relances.
revoke execute on function dac7_activite(uuid, integer), dac7_retenir(uuid),
  dac7_relancer() from authenticated;

grant execute on function dac7_status(), dac7_report(integer), dac7_statement(integer),
  dac7_complet(seller_tax_details), dac7_seuil_ventes(), dac7_seuil_montant(),
  dac7_delai_jours() to authenticated;

-- Le vendeur accède à son activité par `dac7_status` et `dac7_statement`, qui
-- la bornent à lui-même ; la modération par `dac7_report`, qui vérifie le rôle.
grant execute on function dac7_activite(uuid, integer), dac7_retenir(uuid),
  dac7_relancer(), dac7_report(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Une porte ouverte trouvée en chemin
-- ---------------------------------------------------------------------------
--
-- Le même droit par défaut laissait `send_push` accessible à tout membre
-- connecté. N'importe qui pouvait donc envoyer à n'importe qui une
-- notification portant notre nom — « votre compte va être suspendu, cliquez
-- ici » — ce qui est exactement l'hameçonnage que l'application prétend
-- détecter dans les conversations.
--
-- Aucun appelant légitime n'en pâtit : les cinq fonctions qui l'utilisent sont
-- toutes à droits du définisseur et appartiennent à `postgres`.
revoke execute on function send_push(uuid, text, text, jsonb) from public, anon, authenticated;
