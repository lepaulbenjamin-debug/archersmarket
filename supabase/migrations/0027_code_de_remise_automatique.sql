-- Le code de remise se pose tout seul.
--
-- Le faire poser par la fonction Edge marcherait, mais ferait dépendre une
-- pièce essentielle de ce que le code applicatif pense à faire. Une commande
-- en paiement direct sans code serait impossible à clore : le vendeur n'a
-- aucun autre moyen de prouver la rencontre.

create function set_handover_code() returns trigger
language plpgsql as $$
begin
  if new.payment_mode = 'direct' and new.handover_code is null then
    new.handover_code := generate_handover_code();
  end if;
  return new;
end;
$$;

create trigger orders_handover_code
  before insert on orders
  for each row execute function set_handover_code();
