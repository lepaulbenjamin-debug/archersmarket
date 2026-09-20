-- Modifier une annonce publiée : ce que la base doit refuser.
--
-- Appliquée en production le 20 septembre 2026. Vérifié à cette occasion, dans
-- une transaction annulée : une annonce vendue refuse toute modification de
-- fond, et accepte toujours d'être remise en ligne. La garde sur les comptes
-- suspendus n'a pas été vue mordre — elle s'appuie sur `auth.uid()`, nul dans
-- l'éditeur SQL — mais elle réemploie telle quelle la fonction en service sur
-- l'insertion depuis la migration 0023.
--
-- L'application ouvre l'édition à l'auteur d'une annonce non vendue. Le
-- contrôle vit ici parce que le cacher dans l'application reviendrait à ne
-- pas le faire : l'API reste ouverte, et une requête écrite à la main ne
-- passe par aucun de nos écrans.
--
-- La propriété est déjà tenue par `listings_update`, qui exige
-- `seller_id = auth.uid()` en lecture comme en écriture. Restent deux trous
-- que l'édition vient d'ouvrir, et qui n'existaient pas quand une annonce
-- était figée à la publication.

-- ---------------------------------------------------------------------------
-- 1. Un compte suspendu ne réécrit pas ses annonces
--
-- `refuse_if_suspended` ne gardait que l'insertion. C'était suffisant tant
-- qu'une annonce publiée ne pouvait plus changer : suspendre un membre gelait
-- de fait tout ce qu'il avait en ligne. Avec l'édition, un compte suspendu
-- pourrait réécrire ses annonces existantes — exactement ce que la suspension
-- est censée arrêter.
--
-- La fonction ne lit aucune colonne de NEW : elle se réemploie telle quelle.
-- Elle interdit aussi le changement de statut, ce qui est voulu — un compte
-- suspendu n'a rien à conclure.
--
-- Les traitements internes passent par le rôle de service, pour lequel
-- `auth.uid()` est nul : ils ne sont donc pas touchés.
create trigger listings_refuse_suspended_update
  before update on listings
  for each row execute function refuse_if_suspended();

-- ---------------------------------------------------------------------------
-- 2. Une annonce vendue ne se réécrit pas
--
-- L'acheteur a acheté ce qui était décrit. Laisser le vendeur changer le
-- titre, le prix ou l'état après coup, c'est laisser réécrire la pièce sur
-- laquelle un litige se tranche.
--
-- Seules les colonnes de fond sont gelées. Le statut reste libre : « remettre
-- en ligne » repasse l'annonce en `active`, et elle redevient modifiable — ce
-- qui est la bonne porte de sortie pour qui s'est trompé de bouton.
create function guard_sold_listing_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'sold' and (
       new.title       is distinct from old.title
    or new.description is distinct from old.description
    or new.price       is distinct from old.price
    or new.category    is distinct from old.category
    or new.brand       is distinct from old.brand
    or new.condition   is distinct from old.condition
    or new.hand        is distinct from old.hand
    or new.draw_weight is distinct from old.draw_weight
    or new.bow_length  is distinct from old.bow_length
    or new.draw_length is distinct from old.draw_length
    or new.spine       is distinct from old.spine
    or new.size        is distinct from old.size
    or new.city        is distinct from old.city
  ) then
    raise exception
      'Cette annonce est vendue : son contenu ne peut plus être modifié. Remettez-la en ligne pour la corriger.';
  end if;
  return new;
end;
$$;

create trigger listings_guard_sold_edit
  before update on listings
  for each row execute function guard_sold_listing_edit();

comment on function guard_sold_listing_edit is
  'Gèle le fond d''une annonce vendue. Le statut reste modifiable : remettre '
  'en ligne rend l''annonce modifiable à nouveau.';

-- Les privilèges par défaut de Supabase rendent exécutable par tous toute
-- fonction créée dans `public`. Une fonction de déclencheur n'a aucune raison
-- d'être appelable, et Postgres la refuserait de toute façon hors déclencheur
-- — mais un droit retiré reste retiré, là où une garde interne est une ligne
-- de code qui peut disparaître à la faveur d'une réécriture.
revoke execute on function guard_sold_listing_edit() from public, anon, authenticated;
