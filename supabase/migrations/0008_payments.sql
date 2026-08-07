-- Paiement sécurisé entre membres, adossé à Stripe Connect.
--
-- Le principe : l'acheteur paie sur le compte de la plateforme, l'argent y
-- reste jusqu'à ce que la réception soit constatée, puis il part chez le
-- vendeur. Ni l'app ni la base ne touchent aux clés Stripe : seules les
-- fonctions Edge, qui portent la clé secrète, écrivent l'état d'une commande.
--
-- Les montants sont en centimes, en entiers. Un prix en flottant finit
-- toujours par produire un centime de trop ou de moins.

-- ---------------------------------------------------------------------------
-- Comptes vendeurs
-- ---------------------------------------------------------------------------

create table seller_accounts (
  user_id uuid primary key references profiles(id) on delete cascade,
  stripe_account_id text not null unique,
  -- Renseignés par Stripe au fil de la vérification d'identité.
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table seller_accounts enable row level security;

-- Chacun ne voit que son propre compte de paiement. Personne n'écrit ici
-- depuis l'app : seules les fonctions Edge le font.
create policy seller_accounts_read on seller_accounts for select
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Commandes
-- ---------------------------------------------------------------------------

create type order_status as enum (
  'pending',    -- créée, paiement pas encore confirmé
  'paid',       -- argent encaissé, en attente d'expédition
  'shipped',    -- vendeur a déclaré l'envoi
  'delivered',  -- réception constatée, délai de recours en cours
  'released',   -- argent transféré au vendeur
  'refunded',   -- acheteur remboursé
  'cancelled',  -- abandonnée avant paiement
  'disputed'    -- litige ouvert, argent gelé
);

create table orders (
  id uuid primary key default gen_random_uuid(),

  -- On empêche de supprimer une annonce ou un compte tant qu'une commande
  -- existe : une trace comptable ne se perd pas avec une suppression de
  -- confort. Les liens vers les membres tombent à null si le compte part.
  listing_id uuid references listings(id) on delete set null,
  buyer_id uuid references profiles(id) on delete set null,
  seller_id uuid references profiles(id) on delete set null,

  -- Ce que l'annonce disait au moment de l'achat : elle peut être modifiée
  -- ou supprimée ensuite, la commande doit rester lisible.
  listing_title text not null,

  -- Tous les montants en centimes.
  item_amount integer not null check (item_amount > 0),
  shipping_amount integer not null default 0 check (shipping_amount >= 0),
  protection_amount integer not null check (protection_amount >= 0),
  total_amount integer not null check (total_amount > 0),
  currency text not null default 'eur',

  status order_status not null default 'pending',

  stripe_payment_intent_id text unique,
  stripe_transfer_id text,
  stripe_refund_id text,

  tracking_carrier text,
  tracking_number text,

  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  released_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Le total doit toujours s'expliquer par ses composantes.
  constraint orders_total_coherent
    check (total_amount = item_amount + shipping_amount + protection_amount),
  -- On n'achète pas à soi-même.
  constraint orders_buyer_not_seller check (buyer_id is null or buyer_id <> seller_id)
);

create index orders_buyer_idx on orders (buyer_id, created_at desc);
create index orders_seller_idx on orders (seller_id, created_at desc);
create index orders_listing_idx on orders (listing_id);

alter table orders enable row level security;

-- Une commande ne regarde que ses deux parties.
create policy orders_read on orders for select
  using (buyer_id = auth.uid() or seller_id = auth.uid());

-- Aucune écriture depuis l'app : tout passe par les fonctions ci-dessous ou
-- par les fonctions Edge. Laisser l'app écrire ici reviendrait à la laisser
-- décider qui est payé.

-- ---------------------------------------------------------------------------
-- La règle de calcul
--
-- La protection est à la charge de l'acheteur : le vendeur touche son prix
-- entier. Une seule définition fait foi, ici ; l'app la recopie pour
-- l'affichage et un test vérifie que les deux disent la même chose.
-- ---------------------------------------------------------------------------

create function protection_fee(item_amount integer) returns integer
language sql immutable as $$
  -- 5 % du prix de l'objet, plus 70 centimes fixes.
  select greatest(0, round(item_amount * 0.05)::integer + 70);
$$;

comment on function protection_fee is
  'Frais de protection acheteur, en centimes : 5 % du prix + 0,70 €.';

-- ---------------------------------------------------------------------------
-- Les gestes du vendeur et de l'acheteur
--
-- Chacun est une fonction privilégiée qui vérifie qui appelle et depuis quel
-- état : une commande ne change pas d'état parce que l'app l'a demandé.
-- ---------------------------------------------------------------------------

create function mark_order_shipped(
  order_id uuid,
  carrier text default null,
  tracking text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update orders set
    status = 'shipped',
    tracking_carrier = nullif(trim(coalesce(carrier, '')), ''),
    tracking_number = nullif(trim(coalesce(tracking, '')), ''),
    shipped_at = now(),
    updated_at = now()
  where id = order_id
    and seller_id = auth.uid()
    and status = 'paid';

  if not found then
    raise exception 'Commande introuvable, ou pas au stade de l''expédition.';
  end if;
end;
$$;

create function confirm_order_received(order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update orders set
    status = 'delivered',
    delivered_at = now(),
    updated_at = now()
  where id = order_id
    and buyer_id = auth.uid()
    and status in ('paid', 'shipped');

  if not found then
    raise exception 'Commande introuvable, ou réception déjà confirmée.';
  end if;
end;
$$;

create function open_order_dispute(order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Geler est toujours possible tant que l'argent n'est pas parti : c'est
  -- justement ce que l'acheteur paie.
  update orders set status = 'disputed', updated_at = now()
  where id = order_id
    and (buyer_id = auth.uid() or seller_id = auth.uid())
    and status in ('paid', 'shipped', 'delivered');

  if not found then
    raise exception 'Commande introuvable, ou litige impossible à ce stade.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Suppression de compte
--
-- Un compte ne part pas tant que de l'argent lui est dû ou qu'il en doit :
-- sinon le virement n'aurait plus de destinataire, et l'acheteur perdrait
-- son recours.
-- ---------------------------------------------------------------------------

create or replace function delete_own_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  en_cours integer;
begin
  if me is null then
    raise exception 'Aucune session.';
  end if;

  select count(*) into en_cours from orders
  where (buyer_id = me or seller_id = me)
    and status in ('pending', 'paid', 'shipped', 'delivered', 'disputed');

  if en_cours > 0 then
    raise exception 'Une vente est en cours : terminez-la avant de supprimer le compte.';
  end if;

  delete from auth.users where id = me;
end;
$$;

comment on function delete_own_account is
  'Efface le compte connecté, sauf si une transaction est en cours.';
