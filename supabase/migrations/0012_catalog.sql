-- Élargit le catalogue.
--
-- L'usage a montré deux manques. Le premier vient d'un import réel : « SF »,
-- marque très courante en initiation, tombait sur « Autre ». Le second est
-- structurel — une poignée, des branches et un arc complet vivaient dans la
-- même catégorie, alors que personne ne cherche les trois de la même façon.
--
-- Cinq catégories rejoignent les douze existantes :
--   riser        poignées d'arc classique
--   limbs        branches
--   rest         repose-flèches et berger buttons, jusqu'ici rangés avec les
--                viseurs alors qu'ils n'ont rien à voir
--   arrow-parts  pointes, plumes, encoches, tubes nus
--   tools        presse à arc, coupe-tube, contrôleur d'allonge, balance

alter type listing_category add value if not exists 'riser';
alter type listing_category add value if not exists 'limbs';
alter type listing_category add value if not exists 'rest';
alter type listing_category add value if not exists 'arrow-parts';
alter type listing_category add value if not exists 'tools';
