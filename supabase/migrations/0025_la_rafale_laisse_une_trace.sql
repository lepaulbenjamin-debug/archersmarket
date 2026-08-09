-- La rafale ne laissait aucune trace.
--
-- Le garde-fou écrivait son signal juste avant de lever l'exception qui
-- refuse l'annonce. Or l'exception annule tout ce que l'instruction a fait,
-- signal compris : on bloquait le fraudeur sans jamais garder trace qu'il
-- avait essayé. La modération ne voyait rien, et c'est précisément ce
-- comportement-là qu'elle a besoin de voir.
--
-- Le signal se pose donc désormais sur la dernière annonce *acceptée*, celle
-- qui atteint le plafond. Elle, elle est écrite, donc le signal survit.

create or replace function guard_listing_burst() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  quota integer := coalesce(listing_quota(new.seller_id), 30);
  publiees integer;
begin
  select count(*) into publiees from listings
   where seller_id = new.seller_id and created_at > now() - interval '24 hours';

  if publiees < quota then
    return new;
  end if;

  raise exception 'Vous avez publié % annonces aujourd''hui. Revenez demain pour les suivantes.', publiees;
end;
$$;

create or replace function flag_listing_risks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  mediane numeric;
  reference integer;
  age interval;
  quota integer;
  publiees integer;
begin
  -- Atteindre son plafond n'est pas une faute, mais c'est un rythme, et le
  -- rythme est ce qui distingue le fraudeur pressé du vendeur qui range son
  -- garage. On le note ici, sur une annonce acceptée, pour que la trace reste.
  quota := coalesce(listing_quota(new.seller_id), 30);
  select count(*) into publiees from listings
   where seller_id = new.seller_id and created_at > now() - interval '24 hours';

  if publiees >= quota then
    insert into risk_signals (user_id, kind, weight, detail)
    values (new.seller_id, 'burst_listing', 40,
            format('%s annonces en 24 h, soit le plafond du compte', publiees));
  end if;

  -- Prix très éloigné de la catégorie. On ne compare que si la catégorie
  -- compte assez d'annonces pour qu'une médiane veuille dire quelque chose :
  -- sur trois annonces, elle ne veut rien dire, et l'on se tait.
  select count(*), percentile_cont(0.5) within group (order by price)
    into reference, mediane
    from listings
   where category = new.category and status = 'active' and id <> new.id;

  if reference >= 8 and mediane > 0 and new.price < mediane * 0.35 then
    insert into risk_signals (user_id, kind, weight, detail, listing_id)
    values (new.seller_id, 'price_anomaly', 35,
            format('%s € pour une catégorie à %s € de médiane',
                   round(new.price), round(mediane)),
            new.id);
  end if;

  -- Une annonce de forte valeur sur un compte tout neuf. Pas une faute, mais
  -- exactement la forme d'un appât.
  select now() - p.created_at into age from profiles p where p.id = new.seller_id;
  if age < interval '7 days' and new.price >= 500 then
    insert into risk_signals (user_id, kind, weight, detail, listing_id)
    values (new.seller_id, 'price_anomaly', 30,
            format('%s € publiés par un compte de moins d''une semaine', round(new.price)),
            new.id);
  end if;

  return null;
exception when others then
  -- Peser une annonce ne doit jamais empêcher de la publier.
  return null;
end;
$$;
