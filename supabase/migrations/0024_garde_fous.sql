-- Garde-fous sur les comptes récents.
--
-- Un compte de trois heures qui publie huit arcs à 900 € n'est pas un archer
-- qui fait du tri dans son garage. Mais un archer qui fait du tri dans son
-- garage publie aussi plusieurs annonces d'affilée : la limite doit gêner le
-- fraudeur pressé sans insulter le vendeur ordinaire.
--
-- D'où deux traitements bien distincts :
--
--   — La cadence est plafonnée, et le plafond bloque. C'est le seul endroit
--     où l'on refuse quelque chose automatiquement, parce que le refus est
--     temporaire et réparable : il suffit d'attendre.
--
--   — Le prix et la valeur ne bloquent rien. Ils remontent en modération. Un
--     prix bas peut être une aubaine, une erreur de saisie ou un appât, et
--     seule une lecture humaine fait la différence.

-- ---------------------------------------------------------------------------
-- La cadence
-- ---------------------------------------------------------------------------

create function listing_quota(compte uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case
    -- Les deux premiers jours, on reste très prudent.
    when p.created_at > now() - interval '48 hours' then 3
    when p.created_at > now() - interval '14 days' then 10
    else 30
  end
  from profiles p where p.id = compte;
$$;

comment on function listing_quota is
  'Annonces publiables en 24 h, selon l''ancienneté du compte.';

create function guard_listing_burst() returns trigger
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

  -- On note avant de refuser : c'est la répétition qui intéresse la
  -- modération, pas le refus isolé.
  begin
    insert into risk_signals (user_id, kind, weight, detail)
    values (new.seller_id, 'burst_listing', 40,
            format('%s annonces en 24 h, plafond %s', publiees, quota));
  exception when others then
    null;
  end;

  raise exception 'Vous avez publié % annonces aujourd''hui. Revenez demain pour les suivantes.', publiees;
end;
$$;

create trigger listings_burst_guard
  before insert on listings
  for each row execute function guard_listing_burst();

-- ---------------------------------------------------------------------------
-- Le prix
--
-- On compare à la médiane de la catégorie, et seulement quand la catégorie
-- compte assez d'annonces pour que la médiane veuille dire quelque chose.
-- Sinon on se tait : accuser sur trois annonces n'aurait aucun sens.
-- ---------------------------------------------------------------------------

create function flag_listing_risks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  mediane numeric;
  reference integer;
  age interval;
begin
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

create trigger listings_risk_flag
  after insert on listings
  for each row execute function flag_listing_risks();

comment on function flag_listing_risks is
  'Signale un prix aberrant ou une forte valeur sur compte neuf ; ne bloque rien.';
