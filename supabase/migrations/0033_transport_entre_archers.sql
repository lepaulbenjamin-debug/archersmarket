-- Le transport entre archers.
--
-- Beaucoup d'archers roulent déjà : compétitions, stages, sorties de club.
-- Un arc de 130 cm, fragile et cher, voyage souvent mieux dans le coffre de
-- quelqu'un qui va au même endroit que dans un réseau de messagerie — quand
-- un transporteur l'accepte, ce qui n'est pas toujours le cas.
--
-- Trois contraintes dictent la forme de ce qui suit, et elles viennent du
-- droit plus que de la technique.
--
-- 1. Ce n'est pas un service de transport. Transporter des marchandises pour
--    autrui contre rémunération est une activité réglementée, qui suppose une
--    inscription au registre des transporteurs. Ce que l'archer reçoit est
--    donc une *participation aux frais* de son déplacement — plafonnée, et
--    jamais un bénéfice. C'est le montage du covoiturage.
--
-- 2. Le convoyeur doit être identifiable. Confier un arc à mille euros à un
--    pseudonyme n'a pas de sens : on exige la vérification d'identité, celle
--    que Stripe fait déjà pour les vendeurs.
--
-- 3. La chaîne de garde doit se prouver. Deux codes, et non un : le vendeur
--    en donne un au convoyeur à la remise du colis, l'acheteur lui en donne
--    un autre à la livraison. Le convoyeur ne peut donc falsifier ni le
--    départ ni l'arrivée, et l'on sait à tout instant qui détient l'arc.
--
-- Ce que cela ne règle pas, et qu'il faut dire : si le convoyeur perd ou
-- casse l'arc, l'acheteur est remboursé par le séquestre — mais c'est la
-- plateforme qui supporte la perte, à charge pour elle de se retourner contre
-- lui. D'où un plafond de valeur, tant que nous n'avons pas d'assureur.

-- ---------------------------------------------------------------------------
-- Les trajets déclarés
-- ---------------------------------------------------------------------------

create table archer_trips (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references profiles(id) on delete cascade,

  from_zip text not null check (from_zip ~ '^[0-9]{5}$'),
  from_city text not null check (char_length(trim(from_city)) >= 2),
  to_zip text not null check (to_zip ~ '^[0-9]{5}$'),
  to_city text not null check (char_length(trim(to_city)) >= 2),

  depart_on date not null,
  -- « Championnat régional de Vichy », pour que l'on sache de quoi il s'agit.
  note text check (note is null or char_length(note) <= 200),

  -- Ce que le coffre accepte. Un archer qui monte en citadine ne prendra pas
  -- un arc en valise de 130 cm.
  max_parcel parcel_size not null default 'long',

  /** Participation aux frais demandée, en centimes. Plafonnée plus bas. */
  contribution integer not null check (contribution >= 0),

  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),

  -- Un trajet déjà passé n'a plus d'intérêt.
  constraint archer_trips_futur check (depart_on >= '2020-01-01')
);

create index archer_trips_route_idx on archer_trips (depart_on, from_zip, to_zip)
  where status = 'open';
create index archer_trips_carrier_idx on archer_trips (carrier_id, depart_on desc);

alter table archer_trips enable row level security;

-- Les trajets sont publics : c'est leur raison d'être. Mais seul leur auteur
-- les écrit.
create policy archer_trips_read on archer_trips for select using (true);
create policy archer_trips_insert on archer_trips for insert
  with check (carrier_id = auth.uid());
create policy archer_trips_update on archer_trips for update
  using (carrier_id = auth.uid()) with check (carrier_id = auth.uid());
create policy archer_trips_delete on archer_trips for delete
  using (carrier_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Les garde-fous du montage
-- ---------------------------------------------------------------------------

/**
 * Participation maximale, en centimes.
 *
 * Elle doit rester crédible comme partage de frais : au-delà, ce n'est plus
 * une contribution au carburant mais une prestation, et le convoyeur devient
 * un transporteur au sens du code des transports.
 */
create function max_contribution() returns integer
language sql immutable as $$ select 2500; $$;

/**
 * Valeur maximale d'un objet confié à un archer, en centimes.
 *
 * Tant que nous n'avons pas d'assureur, une perte est à notre charge. Ce
 * plafond borne ce que nous pouvons perdre sur un seul colis.
 */
create function max_archer_value() returns integer
language sql immutable as $$ select 80000; $$;

alter table archer_trips add constraint archer_trips_contribution_plafond
  check (contribution <= 2500);

comment on function max_contribution is
  'Participation aux frais maximale : au-delà, ce n''est plus du partage de frais.';
comment on function max_archer_value is
  'Valeur maximale confiée à un archer, faute d''assurance.';

-- Seul un membre dont l'identité est vérifiée peut convoyer.
create function guard_trip_carrier() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select p.accepts_payments from profiles p where p.id = new.carrier_id), false) then
    raise exception 'Vérifiez votre identité avant de proposer un trajet.';
  end if;
  return new;
end;
$$;

create trigger archer_trips_carrier_guard
  before insert on archer_trips
  for each row execute function guard_trip_carrier();

-- ---------------------------------------------------------------------------
-- La commande confiée à un archer
-- ---------------------------------------------------------------------------

alter table orders drop constraint orders_shipping_mode_check;
alter table orders add constraint orders_shipping_mode_check
  check (shipping_mode in ('home', 'relay', 'hand', 'archer'));

alter table orders
  add column carrier_id uuid references profiles(id) on delete set null,
  add column trip_id uuid references archer_trips(id) on delete set null,
  -- Ce que le convoyeur recevra, prélevé sur ce que l'acheteur a réglé.
  add column carrier_amount integer not null default 0 check (carrier_amount >= 0),
  add column carrier_transfer_id text,
  -- Le code que le vendeur remet au convoyeur au départ. Celui de l'acheteur
  -- reste `handover_code`, et sert à l'arrivée.
  add column pickup_code text,
  add column picked_up_at timestamptz;

-- On ne se convoie pas à soi-même, et un convoyeur n'est pas une partie.
alter table orders add constraint orders_carrier_distinct check (
  carrier_id is null or (carrier_id <> buyer_id and carrier_id <> seller_id)
);

-- Le mode et le convoyeur vont ensemble.
alter table orders add constraint orders_carrier_coherent check (
  (shipping_mode = 'archer') = (carrier_id is not null)
);

-- Comme le code de remise, celui du départ ne se lit pas depuis l'app.
revoke select (pickup_code) on orders from authenticated, anon;

grant select (carrier_id, trip_id, carrier_amount, carrier_transfer_id, picked_up_at)
  on orders to authenticated;
