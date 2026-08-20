-- L'identité vérifiée lève le plafond de publication.
--
-- Le plafond par ancienneté gêne le fraudeur pressé, mais il gêne aussi
-- l'archer qui vide son garage un dimanche. Or nous disposons déjà d'un
-- moyen de distinguer les deux : la vérification d'identité de Stripe, qui
-- réclame une pièce d'identité et un IBAN.
--
-- C'est un excellent filtre, pour une raison simple : celui qui monte une
-- arnaque ne transmet pas ses papiers. Et s'il le fait quand même, nous
-- tenons enfin un point d'ancrage — un compte banni ne se recrée pas en deux
-- minutes quand il faut repasser devant le même contrôle d'identité.
--
-- L'attente devient donc une incitation plutôt qu'une punition : trois
-- annonces par jour, ou trente en se présentant.
--
-- Ce qui ne change pas : la vérification reste facultative. La rendre
-- obligatoire annulerait ce que la remise en main propre vient d'ouvrir —
-- vendre son arc au club sans passer par un contrôle bancaire.

create or replace function listing_quota(compte uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case
    -- Identité vérifiée : on saute la période d'observation. Le plafond
    -- subsiste, mais seulement comme garde-fou contre l'emballement.
    when p.accepts_payments then 30
    -- Les deux premiers jours, on reste très prudent.
    when p.created_at > now() - interval '48 hours' then 3
    when p.created_at > now() - interval '14 days' then 10
    else 30
  end
  from profiles p where p.id = compte;
$$;

comment on function listing_quota is
  'Annonces publiables en 24 h : levé par la vérification d''identité, sinon par l''ancienneté.';

-- Le refus doit dire comment en sortir. « Revenez demain » laisse le vendeur
-- devant une porte close sans lui montrer la clé qu'il a dans la poche.
create or replace function guard_listing_burst() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  quota integer := coalesce(listing_quota(new.seller_id), 30);
  verifie boolean := coalesce(
    (select p.accepts_payments from profiles p where p.id = new.seller_id), false);
  publiees integer;
begin
  select count(*) into publiees from listings
   where seller_id = new.seller_id and created_at > now() - interval '24 hours';

  if publiees < quota then
    return new;
  end if;

  if verifie then
    raise exception 'Vous avez publié % annonces aujourd''hui. Revenez demain pour les suivantes.', publiees;
  end if;

  raise exception 'Vous avez publié % annonces aujourd''hui. Vérifiez votre identité pour publier davantage, ou revenez demain.', publiees;
end;
$$;
