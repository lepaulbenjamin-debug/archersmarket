-- Qui détient l'arc, et depuis quand.
--
-- Un colis confié à un archer passe par trois mains. Le séquestre ne suffit
-- pas à dire où il en est : il faut pouvoir prouver, à chaque étape, que la
-- remise a réellement eu lieu.
--
-- D'où deux codes, tenus par les deux extrémités et saisis tous deux par le
-- convoyeur. Il ne peut donc falsifier ni le départ — il faut que le vendeur
-- lui donne son code — ni l'arrivée. Et si l'arc disparaît, on sait entre
-- quelles deux mains.

-- Le code de départ se pose tout seul, comme celui de remise.
create or replace function set_handover_code() returns trigger
language plpgsql as $$
begin
  if new.payment_mode = 'direct' and new.handover_code is null then
    new.handover_code := generate_handover_code();
  end if;

  -- Un convoyage réclame les deux : celui du vendeur au départ, celui de
  -- l'acheteur à l'arrivée.
  if new.shipping_mode = 'archer' then
    if new.pickup_code is null then
      new.pickup_code := generate_handover_code();
    end if;
    if new.handover_code is null then
      new.handover_code := generate_handover_code();
    end if;
  end if;

  return new;
end;
$$;

/**
 * Le code de départ, rendu au vendeur seul.
 *
 * Symétrique de `handover_code()`, qui rend celui de l'acheteur. Chacun ne
 * connaît que le sien : c'est ce qui fait la preuve.
 */
create function pickup_code(order_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  code text;
begin
  select o.pickup_code into code from orders o
   where o.id = pickup_code.order_id
     and o.seller_id = auth.uid()
     and o.shipping_mode = 'archer';

  if code is null then
    raise exception 'Aucun code de remise pour cette commande.';
  end if;
  return code;
end;
$$;

/** Comparaison à durée constante : quatre chiffres se devinent vite. */
create function codes_egaux(attendu text, fourni text) returns boolean
language plpgsql immutable as $$
declare
  propre text := regexp_replace(coalesce(fourni, ''), '\s', '', 'g');
  diff integer := 0;
  i integer;
begin
  if attendu is null or length(propre) <> length(attendu) then
    return false;
  end if;
  for i in 1 .. length(attendu) loop
    diff := diff | (ascii(substr(attendu, i, 1)) # ascii(substr(propre, i, 1)));
  end loop;
  return diff = 0;
end;
$$;

/**
 * Le convoyeur prend le colis, sur présentation du code du vendeur.
 *
 * À partir de cet instant, c'est lui qui détient l'arc, et l'horodatage le
 * dit. C'est la seule pièce dont nous disposerons si quelque chose se perd.
 */
create function confirm_pickup(order_id uuid, code text) returns void
language plpgsql security definer set search_path = public as $$
declare
  attendu text;
begin
  select o.pickup_code into attendu from orders o
   where o.id = confirm_pickup.order_id
     and o.carrier_id = auth.uid()
     and o.shipping_mode = 'archer'
     and o.status = 'paid'
     and o.picked_up_at is null;

  if attendu is null then
    raise exception 'Commande introuvable, ou colis déjà pris en charge.';
  end if;
  if not codes_egaux(attendu, code) then
    raise exception 'Code incorrect.';
  end if;

  update orders set
    status = 'shipped',
    picked_up_at = now(),
    shipped_at = now(),
    tracking_carrier = 'Convoyage entre archers',
    updated_at = now()
  where id = confirm_pickup.order_id;
end;
$$;

/**
 * Le convoyeur remet le colis, sur présentation du code de l'acheteur.
 *
 * L'acheteur ne le donne qu'après avoir vu l'arc : c'est ce qui empêche de
 * clore une livraison qui n'a pas eu lieu.
 */
create function confirm_delivery(order_id uuid, code text) returns void
language plpgsql security definer set search_path = public as $$
declare
  attendu text;
begin
  select o.handover_code into attendu from orders o
   where o.id = confirm_delivery.order_id
     and o.carrier_id = auth.uid()
     and o.shipping_mode = 'archer'
     and o.status = 'shipped'
     and o.picked_up_at is not null;

  if attendu is null then
    raise exception 'Commande introuvable, ou colis pas encore pris en charge.';
  end if;
  if not codes_egaux(attendu, code) then
    raise exception 'Code incorrect.';
  end if;

  -- Livré, mais pas soldé : le délai de recours de l'acheteur court comme
  -- pour n'importe quelle livraison, et c'est le balayage qui paiera.
  update orders set
    status = 'delivered',
    delivered_at = now(),
    updated_at = now()
  where id = confirm_delivery.order_id;
end;
$$;

comment on function confirm_pickup is
  'Le convoyeur prend le colis ; à partir de là, il en répond.';
comment on function confirm_delivery is
  'Le convoyeur remet le colis, sur le code que l''acheteur lui donne.';

-- ---------------------------------------------------------------------------
-- Ce que le convoyage ne doit jamais permettre
-- ---------------------------------------------------------------------------

create function guard_archer_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  valeur integer := new.item_amount;
begin
  if new.shipping_mode <> 'archer' then
    return new;
  end if;

  -- Faute d'assureur, une perte est à notre charge : on borne ce qu'un seul
  -- colis peut nous coûter.
  if valeur > max_archer_value() then
    raise exception 'Cet objet dépasse la valeur confiable à un archer (% €).',
      max_archer_value() / 100;
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

create trigger orders_archer_guard
  before insert or update on orders
  for each row execute function guard_archer_order();
