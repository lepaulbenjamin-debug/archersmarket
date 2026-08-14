-- Rendre le convoyage visible avant le paiement.
--
-- Le dispositif marchait, mais personne ne pouvait le savoir : les trajets
-- n'apparaissaient qu'à l'écran de paiement, après la saisie complète d'une
-- adresse de livraison. Un acheteur qui n'allait pas jusque-là n'apprenait
-- jamais qu'un archer passait chez lui, et un convoyeur déclarait ses trajets
-- sans jamais voir s'ils servaient à quelque chose.
--
-- Pour un dispositif qui n'existe que s'il y a du monde des deux côtés, c'était
-- le pire endroit possible.
--
-- Deux compteurs, donc. Ils ne rendent que des nombres : ni identité, ni
-- adresse, ni date précise. Un compteur qui descend à un seul trajet ne doit
-- pas désigner quelqu'un.

-- ---------------------------------------------------------------------------
-- Côté acheteur : « des archers partent d'ici »
-- ---------------------------------------------------------------------------

/**
 * Combien d'archers partent prochainement du secteur de cette annonce.
 *
 * On ne sait pas encore où va l'acheteur — il n'a rien saisi — donc on ne
 * promet pas une correspondance : on dit seulement qu'il y a du mouvement au
 * départ. L'écran doit le formuler ainsi, sans laisser croire que l'un de ces
 * trajets va forcément chez lui.
 *
 * Le département du vendeur n'est pas un secret : la ville de l'annonce est
 * déjà affichée. Ce compteur n'apprend donc rien de neuf sur lui.
 *
 * Trente jours : au-delà, un trajet annoncé ne pèse plus sur une décision
 * d'achat prise aujourd'hui.
 */
create function trips_from_listing_area(listing_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  moi uuid := auth.uid();
  vendeur uuid;
  format parcel_size;
  depart text;
  prix integer;
  total integer;
begin
  if moi is null then
    return 0;
  end if;

  select l.seller_id, coalesce(l.parcel_size, 'medium'), round(l.price * 100)
    into vendeur, format, prix
    from listings l
   where l.id = trips_from_listing_area.listing_id
     and l.status = 'active'
     and l.shipping;

  if vendeur is null then
    return 0;
  end if;

  -- Sans adresse d'expédition, aucun trajet ne peut être rapproché de cette
  -- annonce : autant ne rien annoncer.
  select a.zip into depart from seller_addresses a where a.user_id = vendeur;
  if depart is null then
    return 0;
  end if;

  -- Au-dessus du plafond de la caisse, le convoyage est refusé au paiement.
  -- L'annoncer ici serait promettre ce qu'on refusera ensuite.
  if prix > archer_value_cap() then
    return 0;
  end if;

  select count(*) into total
    from archer_trips t
   where t.status = 'open'
     and t.depart_on between current_date and current_date + 30
     and departement(t.from_zip) = departement(depart)
     and t.carrier_id <> moi
     and t.carrier_id <> vendeur
     and t.max_parcel >= format;

  return total;
end;
$$;

comment on function trips_from_listing_area is
  'Combien d''archers partent du secteur de cette annonce dans le mois, sans dire lesquels.';

-- ---------------------------------------------------------------------------
-- Côté convoyeur : « il y a de quoi porter chez vous »
-- ---------------------------------------------------------------------------

/**
 * Ce qu'un convoyeur a à gagner à déclarer un trajet.
 *
 * Le nombre d'annonces qui pourraient partir de ses départements — celui de
 * son adresse d'expédition s'il en a une, et ceux d'où partent ses propres
 * trajets. Sans aucun de ces deux repères, on ne sait pas où il est et on rend
 * un compte nul plutôt que d'inventer.
 *
 * Le mot juste est « annonces », pas « colis en attente » : rien dans la base
 * ne dit qu'un acheteur cherche un convoyeur. Ce qu'on compte, c'est ce qui
 * pourrait voyager, et l'écran ne doit pas prétendre davantage.
 */
create function convoyage_demand() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  moi uuid := auth.uid();
  secteurs text[];
  annonces integer;
begin
  if moi is null then
    raise exception 'Connexion requise.';
  end if;

  select array_agg(distinct d) into secteurs from (
    select departement(a.zip) as d from seller_addresses a where a.user_id = moi
    union
    select departement(t.from_zip) from archer_trips t
     where t.carrier_id = moi and t.depart_on >= current_date - 180
  ) as reperes where d is not null and d <> '';

  if secteurs is null then
    return jsonb_build_object('departments', '[]'::jsonb, 'listings', 0);
  end if;

  select count(*) into annonces
    from listings l
    join seller_addresses a on a.user_id = l.seller_id
   where l.status = 'active'
     and l.shipping
     and l.seller_id <> moi
     and departement(a.zip) = any (secteurs)
     and round(l.price * 100) <= archer_value_cap();

  return jsonb_build_object(
    'departments', to_jsonb(secteurs),
    'listings', annonces
  );
end;
$$;

comment on function convoyage_demand is
  'Combien d''annonces pourraient partir des départements de ce convoyeur.';

-- Les deux tiennent déjà leur propre contrôle d'accès : elles refusent un
-- appelant sans session et n'exposent que des nombres. On ferme quand même la
-- porte, pour que la surface publique corresponde à l'intention.
--
-- Retirer le droit à `anon` seul ne servirait à rien : Postgres accorde
-- l'exécution à PUBLIC à la création, et `anon` en hérite. C'est PUBLIC qu'il
-- faut retirer d'abord — le piège a déjà coûté une fuite sur la caisse de
-- garantie, en 0035.
revoke execute on function trips_from_listing_area(uuid), convoyage_demand()
  from public, anon;
grant execute on function trips_from_listing_area(uuid), convoyage_demand()
  to authenticated, service_role;
