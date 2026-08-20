-- Le fonds de garantie du convoyage entre archers.
--
-- La migration 0033 posait un plafond de 800 € sur ce qu'un archer peut
-- convoyer, avec ce commentaire : « faute d'assurance, une perte est à notre
-- charge ». C'était honnête sur le principe et creux sur le fond — le chiffre
-- ne reposait sur rien. Voici ce qui le remplit.
--
-- Le montage est volontairement *pas* une assurance, et la distinction n'est
-- pas cosmétique. Vendre à l'acheteur une couverture portée par un tiers
-- ferait de nous un intermédiaire d'assurance, avec l'inscription à l'ORIAS
-- et les obligations qui vont avec. Ici, personne ne souscrit rien : nous
-- devons déjà à l'acheteur le remboursement de sa commande si le colis se
-- perd — c'est notre promesse de protection — et nous provisionnons cette
-- dette-là. Une caisse pour nos propres engagements, pas un produit vendu.
--
-- Elle s'alimente sur les frais que nous prélevons déjà : rien de nouveau
-- n'est facturé à personne. Un prélèvement par commande convoyée part de
-- notre marge vers la caisse, et n'en sort que pour payer une perte réelle.
--
-- Ce fonds ne concerne que le convoyage entre archers. Les envois par
-- transporteur sont couverts par l'assurance ad valorem de Boxtal, qui a des
-- réserves autrement plus grandes que les nôtres.

-- ---------------------------------------------------------------------------
-- Le registre
-- ---------------------------------------------------------------------------

create table guarantee_fund (
  id uuid primary key default gen_random_uuid(),
  -- Nul pour une dotation : elle ne se rattache à aucune commande.
  order_id uuid references orders(id) on delete set null,

  kind text not null check (kind in ('endowment', 'levy', 'claim', 'adjustment')),

  /** Signé, en centimes : positif ce qui entre, négatif ce qui sort. */
  amount integer not null check (amount <> 0),

  note text check (note is null or char_length(note) <= 300),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  -- Une dotation qui appauvrit la caisse ou un sinistre qui l'enrichit
  -- seraient des erreurs de saisie, pas des écritures.
  constraint guarantee_fund_sens check (
    (kind in ('endowment', 'levy') and amount > 0)
    or (kind = 'claim' and amount < 0)
    or kind = 'adjustment'
  )
);

-- Une commande ne se prélève qu'une fois, même si son statut repasse par
-- « payée ».
create unique index guarantee_fund_levy_unique
  on guarantee_fund (order_id) where kind = 'levy';
create index guarantee_fund_date_idx on guarantee_fund (created_at desc);

alter table guarantee_fund enable row level security;

-- Personne n'écrit dans le registre depuis l'app : les écritures passent par
-- les fonctions ci-dessous, ou par le service. Seule la modération le lit.
create policy guarantee_fund_read on guarantee_fund for select
  using (is_moderator());

comment on table guarantee_fund is
  'Provision pour les pertes du convoyage entre archers. Ce n''est pas un contrat d''assurance.';

-- ---------------------------------------------------------------------------
-- Ce que la caisse vaut, et ce qu'elle doit
-- ---------------------------------------------------------------------------

/**
 * Le prélèvement, en points de base de la valeur de l'objet.
 *
 * 1 % : à ce rythme, cent convoyages d'un arc à 800 € financent la perte de
 * l'un d'eux. C'est un ordre de grandeur, pas une prime actuarielle — nous
 * n'avons aucun historique de sinistres, et le taux se corrigera quand nous
 * en aurons un.
 */
create function guarantee_rate() returns integer
language sql immutable as $$ select 100; $$;

/**
 * Ce que la plateforme accepte de perdre sur ses fonds propres avant que la
 * caisse ne prenne le relais.
 *
 * Sans cette avance, le premier convoyage serait impossible : la caisse est
 * vide, et une caisse vide ne garantit rien. C'est donc un découvert assumé,
 * écrit ici pour qu'il soit su plutôt que supposé.
 */
create function guarantee_endowment() returns integer
language sql immutable as $$ select 50000; $$;

/**
 * Le prélèvement d'une commande, en centimes.
 *
 * Borné par les frais effectivement encaissés sur cette commande : la caisse
 * se remplit de notre marge, jamais au-delà.
 */
create function guarantee_levy(item_amount integer) returns integer
language sql immutable as $$
  select least(
    greatest(50, round(greatest(0, item_amount) * guarantee_rate() / 10000.0)::integer),
    protection_fee(item_amount)
  );
$$;

create function guarantee_balance() returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::integer from guarantee_fund;
$$;

/**
 * Ce qui est en l'air : la valeur des colis actuellement entre les mains d'un
 * archer, ou en attente de l'être.
 *
 * C'est le vrai test de solvabilité. Une caisse de 500 € ne garantit pas dix
 * arcs à 500 € partis le même week-end.
 */
create function guarantee_exposure(exclude_order uuid default null) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(o.item_amount), 0)::integer
    from orders o
   where o.shipping_mode = 'archer'
     and o.status in ('paid', 'shipped')
     and (exclude_order is null or o.id <> exclude_order);
$$;

/** Ce que la caisse peut encore garantir. */
create function guarantee_capacity(exclude_order uuid default null) returns integer
language sql stable security definer set search_path = public as $$
  select guarantee_endowment() + guarantee_balance() - guarantee_exposure(exclude_order);
$$;

/**
 * La valeur maximale qu'un archer peut convoyer *en ce moment*.
 *
 * Deux bornes : celle du montage — au-delà, confier un objet à un particulier
 * n'est pas raisonnable quel que soit l'état de la caisse — et celle de la
 * caisse elle-même. La plus basse gagne.
 */
create function archer_value_cap() returns integer
language sql stable security definer set search_path = public as $$
  select least(max_archer_value(), greatest(0, guarantee_capacity()));
$$;

-- L'état de nos comptes ne regarde personne. Retirer le droit à
-- `authenticated` ne suffit pas : Postgres accorde l'exécution à `public` par
-- défaut, et c'est ce droit-là qui rendait le solde lisible par tout le monde.
-- `archer_value_cap`, elle, reste ouverte : c'est une limite de service, que
-- l'app doit pouvoir annoncer.
revoke execute on function guarantee_balance, guarantee_exposure, guarantee_capacity
  from public, authenticated, anon;

-- ---------------------------------------------------------------------------
-- Les écritures
-- ---------------------------------------------------------------------------

/**
 * Le prélèvement se pose quand la commande est payée, parce que c'est à cet
 * instant que nous encaissons les frais dont il sort.
 */
create function record_guarantee_levy() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.shipping_mode = 'archer' and new.status = 'paid'
     and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    insert into guarantee_fund (order_id, kind, amount, note)
    values (
      new.id, 'levy', guarantee_levy(new.item_amount),
      'Prélèvement sur les frais de protection'
    )
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger orders_guarantee_levy
  after insert or update of status on orders
  for each row execute function record_guarantee_levy();

/** Doter la caisse. Réservé à la modération. */
create function credit_guarantee_fund(amount integer, note text default null)
returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator() then
    raise exception 'Réservé à la modération.';
  end if;
  if amount is null or amount <= 0 then
    raise exception 'Le montant doit être positif.';
  end if;

  insert into guarantee_fund (kind, amount, note, created_by)
  values ('endowment', amount, note, auth.uid());

  return guarantee_balance();
end;
$$;

/**
 * Payer une perte.
 *
 * Le remboursement de l'acheteur se fait par Stripe comme n'importe quel
 * remboursement ; ceci n'en est que la contrepartie comptable, pour que la
 * caisse dise la vérité sur ce qu'elle a déjà absorbé.
 */
create function pay_guarantee_claim(order_id uuid, amount integer, note text default null)
returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator() then
    raise exception 'Réservé à la modération.';
  end if;
  if amount is null or amount <= 0 then
    raise exception 'Le montant doit être positif.';
  end if;
  if not exists (select 1 from orders o where o.id = pay_guarantee_claim.order_id) then
    raise exception 'Commande introuvable.';
  end if;

  insert into guarantee_fund (order_id, kind, amount, note, created_by)
  values (pay_guarantee_claim.order_id, 'claim', -amount, note, auth.uid());

  return guarantee_balance();
end;
$$;

/**
 * L'état de la caisse, d'un coup d'œil.
 *
 * Une fonction et non une vue : Postgres vérifie le droit d'exécuter une
 * fonction au nom de l'appelant, même à travers une vue — seules les *tables*
 * sont lues au nom du propriétaire. Une vue aurait donc rendu « permission
 * refusée » à la modération elle-même.
 */
create function guarantee_state()
returns table (
  endowment integer,
  balance integer,
  exposure integer,
  capacity integer,
  value_cap integer,
  levies bigint,
  claims bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator() then
    raise exception 'Réservé à la modération.';
  end if;

  return query select
    guarantee_endowment(),
    guarantee_balance(),
    guarantee_exposure(),
    guarantee_capacity(),
    archer_value_cap(),
    (select count(*) from guarantee_fund where kind = 'levy'),
    (select count(*) from guarantee_fund where kind = 'claim');
end;
$$;

-- ---------------------------------------------------------------------------
-- Le plafond, désormais adossé à quelque chose
-- ---------------------------------------------------------------------------

-- Les commandes en l'air se comptent à chaque convoyage : autant qu'elles se
-- trouvent vite.
create index orders_archer_encours_idx on orders (shipping_mode, status)
  where shipping_mode = 'archer';

create or replace function guard_archer_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  valeur integer := new.item_amount;
  disponible integer;
begin
  if new.shipping_mode <> 'archer' then
    return new;
  end if;

  -- La borne du montage : au-delà, on ne confie pas, quelle que soit la caisse.
  if valeur > max_archer_value() then
    raise exception 'Cet objet dépasse la valeur confiable à un archer (% €).',
      max_archer_value() / 100;
  end if;

  -- La borne de la caisse : ce qu'elle peut encore couvrir, une fois déduits
  -- les colis déjà en route. On s'exclut du calcul, sans quoi une mise à jour
  -- de la commande se compterait elle-même.
  disponible := guarantee_capacity(new.id);
  if valeur > disponible then
    raise exception 'Le convoyage entre archers est complet pour le moment. Réessayez dans quelques jours, ou choisissez un transporteur.';
  end if;

  -- Une participation trop élevée ferait du convoyeur un transporteur.
  if new.carrier_amount > max_contribution() then
    raise exception 'La participation aux frais dépasse le plafond autorisé.';
  end if;

  -- Convoyer suppose une identité vérifiée : on ne confie pas un arc à un
  -- pseudonyme.
  if not coalesce(
       (select p.accepts_payments from profiles p where p.id = new.carrier_id), false) then
    raise exception 'Ce convoyeur n''a pas vérifié son identité.';
  end if;

  return new;
end;
$$;

comment on function archer_value_cap is
  'Valeur maximale convoyable maintenant : le plus bas du plafond et de la caisse.';
comment on function guarantee_levy is
  'Ce qu''une commande convoyée verse à la caisse, pris sur nos frais.';
