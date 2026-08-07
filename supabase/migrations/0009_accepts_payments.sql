-- « Ce vendeur accepte-t-il le paiement sécurisé ? »
--
-- L'acheteur a besoin de le savoir avant de toucher le bouton d'achat, mais
-- les comptes Stripe restent privés : personne ne doit pouvoir lire
-- l'identifiant de compte d'un autre, ni son état de vérification détaillé.
--
-- D'où un simple drapeau sur le profil, déjà public, tenu à jour par la base
-- elle-même. Il ne dit rien de plus que « oui » ou « non ».

alter table profiles add column accepts_payments boolean not null default false;

create function refresh_accepts_payments() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target uuid := coalesce(new.user_id, old.user_id);
begin
  update profiles set accepts_payments = coalesce(
    (select a.charges_enabled and a.payouts_enabled
     from seller_accounts a where a.user_id = target), false
  )
  where id = target;
  return coalesce(new, old);
end;
$$;

create trigger on_seller_account_changed
  after insert or update or delete on seller_accounts
  for each row execute function refresh_accepts_payments();

-- Rattrape les comptes déjà présents, le cas échéant.
update profiles p set accepts_payments = coalesce(
  (select a.charges_enabled and a.payouts_enabled
   from seller_accounts a where a.user_id = p.id), false
);
