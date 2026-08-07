-- Efface le jeu de démonstration créé par demo.sql, et rien d'autre.
--
-- Les identifiants de démonstration commencent par d0 (membres), d1 (annonces),
-- d2 (conversations), d3 (messages) et d4 (avis). Les comptes réels, eux,
-- portent des identifiants tirés au hasard : la probabilité qu'un d'entre eux
-- commence par 'd0000000-0000-4000-a000-0000000000' est nulle en pratique.

begin;

delete from reviews where id::text like 'd4000000-0000-4000-a000-%';
delete from messages where id::text like 'd3000000-0000-4000-a000-%';
delete from conversations where id::text like 'd2000000-0000-4000-a000-%';
delete from listings where id::text like 'd1000000-0000-4000-a000-%';

-- Emporte le profil, les favoris et les jetons de notification par cascade.
delete from auth.users where id::text like 'd0000000-0000-4000-a000-%';

commit;
