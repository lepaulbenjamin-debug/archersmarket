-- Colmate trois trous du système de confiance.
--
-- Les règles d'accès disaient « chacun modifie sa propre ligne », ce qui est
-- vrai mais insuffisant : sa propre ligne contient aussi sa note, son nombre
-- d'avis et, depuis le paiement, sa capacité à encaisser. Autant de valeurs
-- calculées, qu'un membre n'a aucune raison d'écrire lui-même.
--
-- Constaté en base avant correction :
--   1. un membre pouvait s'attribuer 5,0 étoiles et 99 avis ;
--   2. un vendeur pouvait déclarer vendue une annonce à n'importe qui, sans
--      qu'aucun échange n'ait eu lieu, puis déposer un avis sur cette
--      personne — la note d'un tiers tombait à 1,0 sans qu'il ait rien fait ;
--   3. un vendeur pouvait gonfler le compteur de vues de ses annonces.
--
-- Les règles d'accès ne savent pas raisonner colonne par colonne ; les droits
-- SQL, si. On liste donc ce qui est modifiable, plutôt que ce qui ne l'est
-- pas : un champ ajouté demain sera fermé par défaut.

-- ---------------------------------------------------------------------------
-- Profils : le membre décrit qui il est, la base calcule ce qu'il vaut.
-- ---------------------------------------------------------------------------

revoke update on profiles from authenticated, anon;
grant update (name, city, club, bio, discipline, avatar_path)
  on profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Annonces : le vendeur décrit et gère, il ne compte pas.
-- ---------------------------------------------------------------------------

revoke update on listings from authenticated, anon;
grant update (
  title, description, price, original_price, category, brand, condition, hand,
  draw_weight, bow_length, draw_length, spine, size, city, shipping,
  shipping_price, status, buyer_id, updated_at
) on listings to authenticated;

-- ---------------------------------------------------------------------------
-- L'acheteur désigné doit exister ailleurs que dans l'imagination du vendeur.
-- ---------------------------------------------------------------------------

create function validate_listing_buyer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.buyer_id is null or new.buyer_id is not distinct from old.buyer_id then
    return new;
  end if;

  -- Deux preuves acceptables : la personne vous a écrit au sujet de cette
  -- annonce, ou elle l'a payée.
  if exists (
    select 1 from conversations c
    where c.listing_id = new.id and c.buyer_id = new.buyer_id
  ) or exists (
    select 1 from orders o
    where o.listing_id = new.id
      and o.buyer_id = new.buyer_id
      and o.status in ('paid', 'shipped', 'delivered', 'released')
  ) then
    return new;
  end if;

  raise exception 'L''acheteur désigné doit vous avoir contacté au sujet de cette annonce.';
end;
$$;

create trigger on_listing_buyer_set
  before update of buyer_id on listings
  for each row execute function validate_listing_buyer();

-- ---------------------------------------------------------------------------
-- Remise à zéro des valeurs éventuellement forgées avant ce correctif.
-- ---------------------------------------------------------------------------

update profiles p set
  rating = coalesce((select round(avg(r.rating)::numeric, 1) from reviews r where r.subject_id = p.id), 0),
  review_count = (select count(*) from reviews r where r.subject_id = p.id),
  accepts_payments = coalesce(
    (select a.charges_enabled and a.payouts_enabled from seller_accounts a where a.user_id = p.id),
    false
  );
