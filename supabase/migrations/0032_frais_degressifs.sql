-- Des frais dégressifs, calibrés pour le tir à l'arc.
--
-- Cinq pour cent linéaires, c'est une grille pensée pour des vêtements à
-- quinze euros. Sur un Hoyt à mille deux cents, cela fait soixante euros de
-- frais — et soixante euros, c'est exactement l'argument qui pousse un
-- acheteur à proposer un virement en dehors de l'application.
--
-- Autrement dit, la grille tarifaire et la fraude sont le même problème : au
---delà d'un certain montant, la protection coûte plus cher que le risque
-- qu'elle couvre, et les gens s'en passent.
--
-- D'où un taux qui décroît. Le premier palier reste identique à ce qui se
-- pratique ailleurs, parce qu'il n'y a aucune raison d'être moins cher sur
-- une corde à vingt euros. C'est sur le matériel coûteux, celui qui fait
-- l'archerie, que l'écart se creuse.
--
--   Arc à   100 € :  5,70 €  (inchangé)
--   Arc à   300 € : 15,70 €  (inchangé, c'est la charnière)
--   Arc à   600 € : 23,20 €  au lieu de 30,70 €
--   Arc à 1 000 € : 33,20 €  au lieu de 50,70 €
--   Arc à 1 450 € : 44,45 €  au lieu de 73,20 €
--
-- La fonction reste continue à la charnière : personne ne doit avoir intérêt
-- à baisser son prix de 301 à 299 €.

/** Au-delà de ce montant, le taux baisse. En centimes. */
create function fee_tier() returns integer
language sql immutable as $$ select 30000; $$;

create or replace function protection_fee(item_amount integer) returns integer
language sql immutable as $$
  select greatest(0,
    70                                                        -- part fixe
    + round(least(item_amount, fee_tier()) * 0.05)::integer    -- 5 % jusqu'au palier
    + round(greatest(0, item_amount - fee_tier()) * 0.025)::integer  -- 2,5 % au-delà
  );
$$;

comment on function protection_fee is
  'Frais de protection acheteur, en centimes : 0,70 € + 5 % jusqu''à 300 €, puis 2,5 %.';
