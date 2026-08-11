-- Le convoyage, côté usage.
--
-- Le socle existe depuis 0033 et 0034 : les trajets, les deux codes, la caisse
-- qui borne ce qu'on ose confier. Manquait ce qui permet de s'en servir —
-- trouver un convoyeur quand on achète, et savoir ce qu'on a à faire quand on
-- convoie.
--
-- Deux fonctions, et pas de nouvelle politique de lecture sur les commandes.
-- C'est délibéré : un convoyeur doit connaître deux adresses et un objet, pas
-- le prix payé ni l'historique des parties. Élargir `orders_read` à
-- `carrier_id = auth.uid()` aurait tout ouvert d'un coup ; une fonction à
-- droits du définisseur ne rend que ce qu'elle nomme.
--
-- Même raison pour l'adresse de départ : `seller_addresses` reste privée. Le
-- convoyeur en obtient le contenu par cette fonction-ci, et seulement pour une
-- commande qui lui est confiée.

-- ---------------------------------------------------------------------------
-- Trouver un convoyeur
-- ---------------------------------------------------------------------------

/**
 * Le département d'un code postal.
 *
 * La correspondance se fait à cette maille et pas au code exact : un trajet
 * déclaré depuis Lyon 3e sert évidemment un vendeur de Villeurbanne, et exiger
 * les cinq chiffres ne rendrait jamais aucun résultat. C'est grossier, et
 * l'écran le compense en affichant les villes réelles — au convoyeur et à
 * l'acheteur de juger si le détour est raisonnable.
 */
create function departement(zip text) returns text
language sql immutable as $$ select left(coalesce(zip, ''), 2); $$;

/**
 * Les trajets qui pourraient porter cette annonce jusqu'à ce code postal.
 *
 * L'annonce donne le point de départ — l'adresse d'expédition du vendeur, que
 * l'acheteur ne verra jamais — et le paramètre donne l'arrivée.
 */
create function trips_for_listing(listing_id uuid, dest_zip text)
returns table (
  id uuid,
  carrier_id uuid,
  carrier_name text,
  from_zip text,
  from_city text,
  to_zip text,
  to_city text,
  depart_on date,
  note text,
  max_parcel parcel_size,
  contribution integer,
  parcels_taken bigint
)
language plpgsql security definer set search_path = public as $$
declare
  moi uuid := auth.uid();
  vendeur uuid;
  depart text;
  format parcel_size;
begin
  if moi is null then
    raise exception 'Connexion requise.';
  end if;

  select l.seller_id, coalesce(l.parcel_size, 'medium')
    into vendeur, format
    from listings l
   where l.id = trips_for_listing.listing_id and l.status = 'active';

  if vendeur is null then
    return;
  end if;

  select a.zip into depart from seller_addresses a where a.user_id = vendeur;
  if depart is null then
    return;
  end if;

  return query
    select t.id, t.carrier_id,
           coalesce(p.name, p.handle, 'Archer') as carrier_name,
           t.from_zip, t.from_city, t.to_zip, t.to_city,
           t.depart_on, t.note, t.max_parcel, t.contribution,
           (select count(*) from orders o
             where o.trip_id = t.id and o.status in ('paid', 'shipped')) as parcels_taken
      from archer_trips t
      join profiles p on p.id = t.carrier_id
     where t.status = 'open'
       and t.depart_on >= current_date
       and departement(t.from_zip) = departement(depart)
       and departement(t.to_zip) = departement(trips_for_listing.dest_zip)
       -- Le convoyeur n'est ni l'acheteur ni le vendeur : porter son propre
       -- colis ne prouve rien.
       and t.carrier_id <> moi
       and t.carrier_id <> vendeur
       -- Un coffre qui n'accepte pas ce format ne sert à rien de le proposer.
       and t.max_parcel >= format
     order by t.depart_on, t.contribution;
end;
$$;

comment on function trips_for_listing is
  'Trajets ouverts pouvant porter une annonce, sans révéler l''adresse du vendeur.';

-- ---------------------------------------------------------------------------
-- Savoir ce qu'on a à porter
-- ---------------------------------------------------------------------------

/**
 * Les colis qui me sont confiés, avec ce qu'il faut pour les porter.
 *
 * Ni le prix payé, ni les frais, ni l'identité complète des parties : deux
 * adresses, un objet, une participation, et où en est la chaîne de garde.
 */
create function carrier_missions()
returns table (
  order_id uuid,
  listing_title text,
  status order_status,
  picked_up_at timestamptz,
  contribution integer,
  depart_on date,
  seller_name text,
  from_civility text,
  from_name text,
  from_address text,
  from_zip text,
  from_city text,
  from_phone text,
  to_civility text,
  to_name text,
  to_address text,
  to_zip text,
  to_city text,
  to_phone text
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.';
  end if;

  return query
    select o.id, o.listing_title, o.status, o.picked_up_at, o.carrier_amount,
           t.depart_on,
           coalesce(v.name, v.handle, 'Vendeur'),
           a.civility, a.full_name, a.address, a.zip, a.city, a.phone,
           o.ship_to_civility, o.ship_to_name, o.ship_to_address,
           o.ship_to_zip, o.ship_to_city, o.ship_to_phone
      from orders o
      join profiles v on v.id = o.seller_id
      left join archer_trips t on t.id = o.trip_id
      left join seller_addresses a on a.user_id = o.seller_id
     where o.carrier_id = auth.uid()
       and o.shipping_mode = 'archer'
       and o.status in ('paid', 'shipped', 'delivered', 'released')
     order by o.created_at desc;
end;
$$;

comment on function carrier_missions is
  'Ce qu''un convoyeur doit savoir de ses colis, et rien de plus.';

-- ---------------------------------------------------------------------------
-- Fermer un trajet
-- ---------------------------------------------------------------------------

/**
 * Un trajet qui porte déjà un colis ne s'annule pas d'un revers de main : le
 * vendeur a peut-être déjà remis l'arc, et l'acheteur a payé.
 */
create function guard_trip_close() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled'
     and exists (
       select 1 from orders o
        where o.trip_id = new.id and o.status in ('paid', 'shipped')
     ) then
    raise exception 'Ce trajet porte déjà un colis : contactez l''acheteur avant de l''annuler.';
  end if;
  return new;
end;
$$;

create trigger archer_trips_close_guard
  before update on archer_trips
  for each row execute function guard_trip_close();

-- ---------------------------------------------------------------------------
-- Le code de l'acheteur sert aussi au convoyage
-- ---------------------------------------------------------------------------

/**
 * `handover_code` a été écrite pour la remise en main propre, et ne rendait le
 * code qu'en paiement direct. Un convoyage est en séquestre : l'acheteur
 * n'aurait jamais vu le sien, et n'aurait donc jamais pu accuser réception de
 * l'arc auprès du convoyeur.
 */
create or replace function handover_code(order_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  code text;
begin
  select o.handover_code into code from orders o
   where o.id = handover_code.order_id
     and o.buyer_id = auth.uid()
     and (o.payment_mode = 'direct' or o.shipping_mode = 'archer');

  if code is null then
    raise exception 'Aucun code pour cette commande.';
  end if;
  return code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Prévenir le convoyeur
-- ---------------------------------------------------------------------------

/**
 * Sans cela, un archer déclare un trajet puis n'en entend plus parler : il
 * n'ouvrira pas l'application « au cas où », et le vendeur attendrait avec un
 * colis sur les bras quelqu'un qui ignore qu'on l'attend.
 */
create function notify_carrier_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.shipping_mode = 'archer' and new.status = 'paid'
     and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    perform send_push(
      new.carrier_id,
      'Un colis pour votre trajet',
      format('%s à récupérer chez le vendeur.', left(new.listing_title, 60)),
      jsonb_build_object('route', '/trips')
    );
  end if;
  return null;
end;
$$;

create trigger orders_carrier_notify
  after insert or update of status on orders
  for each row execute function notify_carrier_assigned();
