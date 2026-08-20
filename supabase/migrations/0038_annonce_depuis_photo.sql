-- Une annonce à partir d'une photo.
--
-- Deux choses seulement vivent en base, et ce sont les deux qui ne doivent pas
-- dépendre du modèle : combien d'analyses un membre peut demander, et le prix
-- qu'on lui suggère.
--
-- Le prix, surtout. Un modèle de langage produit un montant plausible et
-- arbitraire ; nos propres annonces produisent un montant vérifiable. On
-- calcule donc une médiane sur ce qui s'est réellement vendu, on affiche le
-- nombre de comparables, et sous cinq on ne propose rien du tout. C'est moins
-- impressionnant qu'un chiffre sorti de nulle part, et c'est la seule version
-- qu'on puisse défendre devant un vendeur qui demande d'où elle sort.

-- ---------------------------------------------------------------------------
-- Le quota
-- ---------------------------------------------------------------------------

create table photo_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  /** Ce que le modèle a répondu, pour mesurer plus tard s'il voyait juste. */
  category text,
  created_at timestamptz not null default now()
);

create index photo_analyses_membre_idx on photo_analyses (user_id, created_at desc);

alter table photo_analyses enable row level security;

-- Chacun voit sa propre consommation, personne n'écrit depuis l'app :
-- l'écriture passe par la fonction ci-dessous, appelée par le service.
create policy photo_analyses_read on photo_analyses for select
  using (user_id = auth.uid());

/**
 * Analyses autorisées par jour et par compte.
 *
 * C'est la première fonction de l'application qui coûte de l'argent à chaque
 * usage. Sans plafond, un compte suffit à transformer Archers Market en
 * service de reconnaissance d'images gratuit.
 */
create function photo_analysis_quota() returns integer
language sql immutable as $$ select 10; $$;

/** Ce qu'il reste au membre connecté aujourd'hui, pour que l'écran le dise. */
create function photo_analyses_left() returns integer
language sql stable security definer set search_path = public as $$
  select greatest(0, photo_analysis_quota() - (
    select count(*)::integer from photo_analyses a
     where a.user_id = auth.uid()
       and a.created_at > now() - interval '24 hours'
  ));
$$;

/**
 * Réserve une analyse, ou refuse.
 *
 * Le membre est passé en paramètre parce que l'appelant est le service, pas
 * l'utilisateur — et c'est précisément pour cela que la fonction est fermée à
 * `public` : sans quoi n'importe qui pourrait consommer le quota d'un autre.
 */
create function claim_photo_analysis(member uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  restant integer;
  ligne uuid;
begin
  select greatest(0, photo_analysis_quota() - (
    select count(*)::integer from photo_analyses a
     where a.user_id = member
       and a.created_at > now() - interval '24 hours'
  )) into restant;

  if restant <= 0 then
    raise exception 'Vous avez atteint le nombre d''analyses de photo pour aujourd''hui.';
  end if;

  -- L'identifiant est rendu à l'appelant : c'est ce qui lui permet de noter
  -- ensuite la catégorie trouvée sur cette ligne-là, et pas sur toutes celles
  -- du membre.
  insert into photo_analyses (user_id) values (member) returning id into ligne;
  return jsonb_build_object('id', ligne, 'left', restant - 1);
end;
$$;

revoke execute on function claim_photo_analysis(uuid) from public, authenticated, anon;

-- ---------------------------------------------------------------------------
-- Le prix, tiré de nos annonces et de rien d'autre
-- ---------------------------------------------------------------------------

/**
 * Fourchette de prix observée pour une catégorie, et si possible une marque.
 *
 * Rend zéro ligne sous cinq comparables : une médiane sur trois annonces n'est
 * pas une médiane, c'est un hasard présenté comme un chiffre.
 */
create function price_suggestion(wanted_category text, wanted_brand text default null)
returns table (
  sample integer,
  low integer,
  median integer,
  high integer,
  scope text
)
language plpgsql stable security definer set search_path = public as $$
declare
  minimum constant integer := 5;
begin
  -- D'abord la marque : un Hoyt et un Cartel ne valent pas la même chose,
  -- même dans la même catégorie.
  if wanted_brand is not null then
    return query
      select count(*)::integer,
             (percentile_cont(0.15) within group (order by l.price) * 100)::integer,
             (percentile_cont(0.5) within group (order by l.price) * 100)::integer,
             (percentile_cont(0.85) within group (order by l.price) * 100)::integer,
             'brand'::text
        from listings l
       where l.category = wanted_category::listing_category
         and l.brand = wanted_brand
         and l.status in ('active', 'sold')
         and l.price > 0
      having count(*) >= minimum;

    if found then
      return;
    end if;
  end if;

  return query
    select count(*)::integer,
           (percentile_cont(0.15) within group (order by l.price) * 100)::integer,
           (percentile_cont(0.5) within group (order by l.price) * 100)::integer,
           (percentile_cont(0.85) within group (order by l.price) * 100)::integer,
           'category'::text
      from listings l
     where l.category = wanted_category::listing_category
       and l.status in ('active', 'sold')
       and l.price > 0
    having count(*) >= minimum;
end;
$$;

comment on function price_suggestion is
  'Fourchette observée sur nos propres annonces. Rien sous cinq comparables.';
comment on table photo_analyses is
  'Consommation du quota d''analyse de photo. Une ligne par appel au modèle.';

-- ---------------------------------------------------------------------------
-- La taxonomie, lisible par le service
-- ---------------------------------------------------------------------------

/**
 * Les marques du marché français de l'occasion.
 *
 * Elles vivaient jusqu'ici uniquement dans `src/data/catalog.ts`, ce qui
 * suffisait tant que seule l'application les lisait. La fonction d'analyse de
 * photo en a besoin pour contraindre le modèle : il choisit dans cette liste
 * ou répond « Autre ». D'où une table, alimentée depuis ce même catalogue.
 */
create table listing_brands (
  name text primary key,
  position integer not null
);

insert into listing_brands (name, position) values
  ('Hoyt', 0),
  ('Win&Win', 1),
  ('WNS', 2),
  ('MK Korea', 3),
  ('Uukha', 4),
  ('Border', 5),
  ('Gillo', 6),
  ('Spigarelli', 7),
  ('Fivics', 8),
  ('Samick', 9),
  ('SF Archery', 10),
  ('Core Archery', 11),
  ('Kinetic', 12),
  ('Sanlida', 13),
  ('Galaxy', 14),
  ('KAP', 15),
  ('Best Archery', 16),
  ('Krossen', 17),
  ('Stellar', 18),
  ('Mathews', 19),
  ('PSE', 20),
  ('Elite', 21),
  ('Bowtech', 22),
  ('Prime', 23),
  ('Hoyt Compound', 24),
  ('Diamond', 25),
  ('Martin', 26),
  ('Mybo', 27),
  ('Bear Archery', 28),
  ('Ragim', 29),
  ('Bearpaw', 30),
  ('Buck Trail', 31),
  ('Big Tradition', 32),
  ('White Feather', 33),
  ('Easton', 34),
  ('Skylon', 35),
  ('Victory', 36),
  ('Carbon Express', 37),
  ('Gold Tip', 38),
  ('Black Eagle', 39),
  ('Cross-X', 40),
  ('Nijora', 41),
  ('Penthalon', 42),
  ('Aurel', 43),
  ('Bohning', 44),
  ('Beiter', 45),
  ('Shibuya', 46),
  ('Axcel', 47),
  ('Sure-Loc', 48),
  ('CBE', 49),
  ('HHA', 50),
  ('Spot Hogg', 51),
  ('Titan', 52),
  ('Arc Systeme', 53),
  ('Doinker', 54),
  ('Bee Stinger', 55),
  ('Fuse', 56),
  ('Carter', 57),
  ('Scott', 58),
  ('TruBall', 59),
  ('AAE', 60),
  ('Hamskea', 61),
  ('QAD', 62),
  ('BCY', 63),
  ('Angel', 64),
  ('Brownell', 65),
  ('Flex Archery', 66),
  ('Cartel', 67),
  ('Decut', 68),
  ('Avalon', 69),
  ('Legend', 70),
  ('Neet', 71),
  ('JVD', 72),
  ('Yate', 73),
  ('Eleven', 74),
  ('Egertec', 75),
  ('Rinehart', 76),
  ('Autre', 77);

alter table listing_brands enable row level security;
create policy listing_brands_read on listing_brands for select using (true);

/**
 * Catégories, états et marques en une seule lecture.
 *
 * Lue par la fonction d'analyse plutôt que recopiée dedans : ajouter une
 * catégorie ne doit pas obliger à se souvenir d'un fichier TypeScript.
 *
 * Sans droits du définisseur, délibérément : les trois listes sont déjà
 * publiques — elles sont embarquées dans chaque copie de l'application — et
 * une fonction privilégiée n'aurait fait que masquer ce fait.
 */
create function listing_taxonomy() returns jsonb
language sql stable as $f$
  select jsonb_build_object(
    'categories', (select jsonb_agg(e.enumlabel order by e.enumsortorder)
                     from pg_enum e join pg_type t on t.oid = e.enumtypid
                    where t.typname = 'listing_category'),
    'conditions', (select jsonb_agg(e.enumlabel order by e.enumsortorder)
                     from pg_enum e join pg_type t on t.oid = e.enumtypid
                    where t.typname = 'listing_condition'),
    'brands', (select jsonb_agg(b.name order by b.position) from listing_brands b)
  );
$f$;

comment on table listing_brands is
  'Marques proposées au vendeur, et liste imposée au modèle qui lit les photos.';
