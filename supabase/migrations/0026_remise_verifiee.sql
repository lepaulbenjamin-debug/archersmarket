-- La remise vérifiée : 0,99 €, sans séquestre.
--
-- Quand deux archers se retrouvent au pas de tir, séquestrer le prix de l'arc
-- n'apporte rien : ils sont l'un en face de l'autre, l'acheteur essaie avant
-- de payer. Ce que nous pouvons vendre à ce moment-là, ce n'est pas une
-- garantie de remboursement — nous n'aurons jamais les fonds — mais un
-- interlocuteur identifié, une trace de la vente, et un code que l'acheteur
-- ne donne qu'après avoir essayé.
--
-- L'économie tient parce que Stripe ne prélève que sur nos 0,99 € : il nous
-- en reste 0,73 quel que soit le prix de l'arc. Et surtout, le vendeur n'a
-- plus besoin d'être vérifié chez Stripe pour vendre en local — c'est cette
-- barrière-là qui nous coûtait le plus de ventes.
--
-- La règle qui ne doit jamais céder : aucune commande de ce type ne peut
-- déclencher un virement. Il n'y a pas de fonds derrière.

-- ---------------------------------------------------------------------------
-- Deux façons de payer
-- ---------------------------------------------------------------------------

create type payment_mode as enum (
  'escrow',  -- l'acheteur paie tout, l'argent attend la réception
  'direct'   -- l'acheteur paie le vendeur sur place ; nous ne prenons que nos frais
);

alter table orders add column payment_mode payment_mode not null default 'escrow';

comment on column orders.payment_mode is
  'escrow : nous portons l''argent. direct : nous ne portons que la mise en relation.';

-- Le total encaissé ne s'explique plus de la même façon selon le mode. En
-- direct, `item_amount` reste noté — c'est le prix convenu, utile aux avis et
-- à la comptabilité — mais il ne passe pas par nous.
alter table orders drop constraint orders_total_coherent;

alter table orders add constraint orders_total_coherent check (
  case payment_mode
    when 'escrow' then total_amount = item_amount + shipping_amount + protection_amount
    when 'direct' then total_amount = protection_amount and shipping_amount = 0
  end
);

-- Un paiement direct suppose forcément une rencontre : on ne se remet pas un
-- arc de la main à la main par la poste. L'inverse n'est pas vrai — une
-- remise en main propre peut très bien être payée d'avance dans
-- l'application, et les commandes antérieures à ce mode le sont toutes.
alter table orders add constraint orders_mode_coherent check (
  payment_mode <> 'direct' or shipping_mode = 'hand'
);

-- ---------------------------------------------------------------------------
-- Le tarif
-- ---------------------------------------------------------------------------

create function handover_fee() returns integer
language sql immutable as $$ select 99; $$;

comment on function handover_fee is
  'Frais de remise vérifiée, en centimes : 0,99 € quel que soit le prix.';

-- ---------------------------------------------------------------------------
-- Le code de remise
--
-- L'acheteur le détient, le vendeur le saisit. C'est ce sens-là qui compte :
-- l'acheteur ne le donne qu'après avoir eu l'arc en main, et la vente ne peut
-- pas être close sans lui. Dans l'autre sens, le vendeur pourrait solder la
-- vente avant même d'avoir sorti l'arc du coffre.
--
-- D'où une précaution : le vendeur ne doit pas pouvoir *lire* ce code. Les
-- règles d'accès sont par ligne, pas par colonne — on retire donc le droit de
-- lecture sur la colonne, et l'acheteur passe par une fonction.
-- ---------------------------------------------------------------------------

alter table orders add column handover_code text;
alter table orders add column handover_at timestamptz;

revoke select (handover_code) on orders from authenticated, anon;

create function generate_handover_code() returns text
language sql volatile as $$
  select lpad((floor(random() * 10000))::integer::text, 4, '0');
$$;

/** Le code, rendu à l'acheteur seul. */
create function handover_code(order_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  code text;
begin
  select o.handover_code into code from orders o
   where o.id = handover_code.order_id
     and o.buyer_id = auth.uid()
     and o.payment_mode = 'direct';

  if code is null then
    raise exception 'Aucun code pour cette commande.';
  end if;
  return code;
end;
$$;

/**
 * Le vendeur clôt la vente en saisissant le code que l'acheteur lui donne.
 *
 * Comparaison à durée constante : sur quatre chiffres, une comparaison naïve
 * se devine, et le vendeur a tout le temps devant lui.
 */
create function confirm_handover(order_id uuid, code text) returns void
language plpgsql security definer set search_path = public as $$
declare
  attendu text;
  fourni text := regexp_replace(coalesce(code, ''), '\s', '', 'g');
  diff integer := 0;
  i integer;
begin
  select o.handover_code into attendu from orders o
   where o.id = confirm_handover.order_id
     and o.seller_id = auth.uid()
     and o.payment_mode = 'direct'
     and o.status = 'paid';

  if attendu is null then
    raise exception 'Commande introuvable, ou remise déjà confirmée.';
  end if;

  if length(fourni) <> length(attendu) then
    raise exception 'Code incorrect.';
  end if;
  for i in 1 .. length(attendu) loop
    diff := diff | (ascii(substr(attendu, i, 1)) # ascii(substr(fourni, i, 1)));
  end loop;
  if diff <> 0 then
    raise exception 'Code incorrect.';
  end if;

  -- Rien à virer : l'argent de l'arc n'est jamais passé par nous. La commande
  -- est simplement close, et l'annonce vendue.
  update orders set
    status = 'released',
    delivered_at = coalesce(delivered_at, now()),
    released_at = now(),
    handover_at = now(),
    updated_at = now()
  where id = confirm_handover.order_id;

  update listings set status = 'sold', buyer_id = (
    select o.buyer_id from orders o where o.id = confirm_handover.order_id
  ), updated_at = now()
  where id = (select o.listing_id from orders o where o.id = confirm_handover.order_id)
    and status <> 'sold';
end;
$$;

comment on function confirm_handover is
  'Clôt une remise en main propre sur présentation du code détenu par l''acheteur.';

-- ---------------------------------------------------------------------------
-- La règle qui protège la plateforme
--
-- Une commande en paiement direct n'a aucun fonds derrière elle. Si un
-- virement partait vers le vendeur, il sortirait de notre trésorerie. Le
-- balayage filtre déjà, mais un garde-fou en base ne dépend pas de ce que le
-- code se rappelle de faire.
-- ---------------------------------------------------------------------------

create function refuse_transfer_on_direct() returns trigger
language plpgsql as $$
begin
  if new.payment_mode = 'direct' and new.stripe_transfer_id is not null then
    raise exception 'Aucun virement ne peut être rattaché à une remise en main propre.';
  end if;
  return new;
end;
$$;

create trigger orders_no_transfer_on_direct
  before insert or update on orders
  for each row execute function refuse_transfer_on_direct();
