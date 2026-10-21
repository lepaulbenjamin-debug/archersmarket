-- Retire ce que personne ne devrait pouvoir appeler.
--
-- `trips_for_listing` est en `security definer` : elle lit `archer_trips` avec
-- les droits de son propriétaire, en passant outre la sécurité au niveau
-- ligne. C'est voulu — elle doit croiser les trajets de tous les archers pour
-- répondre — mais cela veut dire que la liste de ceux qui peuvent l'appeler
-- est la seule barrière qui compte.
--
-- Or elle était exécutable par PUBLIC et par `anon`, hérités des privilèges
-- par défaut que Supabase applique à toute fonction créée dans `public`. La
-- fonction se garde elle-même — `if moi is null then raise exception` — et un
-- visiteur non connecté était bien refusé, vérification faite. Mais une garde
-- interne est une ligne de code : elle peut disparaître à la faveur d'une
-- réécriture, là où un droit retiré reste retiré.
--
-- `trips_from_listing_area`, écrite plus tard, n'a jamais eu ces droits. On
-- aligne.
revoke execute on function public.trips_for_listing(uuid, text) from public, anon;

-- `postal_points` porte la sécurité au niveau ligne sans aucune politique :
-- personne ne la lit directement, et c'est l'intention. Ses 6 310 communes ne
-- sortent que par `distance_km` et `zips_proches`, appelées depuis des
-- fonctions `security definer` qui, elles, filtrent. Le commentaire existe
-- pour qu'on ne « corrige » pas cette absence de politique en croyant à un
-- oubli.
comment on table public.postal_points is
  'Référentiel des codes postaux. Lecture interdite en direct : les distances '
  'ne sortent que par distance_km et zips_proches, appelées depuis les '
  'fonctions security definer du convoyage. L''absence de politique est '
  'délibérée.';
