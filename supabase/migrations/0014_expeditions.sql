-- Expéditions : l'étiquette est achetée par la plateforme, pas par le vendeur.
--
-- Le principe suit celui du paiement. L'acheteur règle le port en même temps
-- que l'objet ; cet argent reste sur le compte de la plateforme, qui achète
-- l'étiquette chez Boxtal et l'envoie au vendeur. Le vendeur n'avance rien et
-- n'a pas de compte transporteur à ouvrir.
--
-- Conséquence à ne pas manquer : quand la plateforme a payé l'étiquette, le
-- port ne doit plus partir chez le vendeur au moment du virement. C'est
-- `shipments.order_id` qui tranche, et la fonction de virement le lit.

-- ---------------------------------------------------------------------------
-- Format du colis
--
-- Le tir à l'arc expédie du long : des branches font 90 cm, un arc en valise
-- en fait 130. Un transporteur qui plafonne à 120 cm doit être écarté avant
-- d'être proposé, pas au moment de l'étiquette. On demande donc un format au
-- vendeur, et on le traduit en poids et dimensions au moment de la cotation.
-- ---------------------------------------------------------------------------

create type parcel_size as enum (
  'small',   -- viseur, décocheur, palette      1 kg   25 × 20 × 10
  'medium',  -- poignée, stabilisateur          3 kg   60 × 25 × 15
  'long',    -- branches, tube de flèches       3 kg   90 × 20 × 15
  'xl'       -- arc complet en valise           8 kg  130 × 35 × 20
);

alter table listings add column parcel_size parcel_size;

comment on column listings.parcel_size is
  'Format d''expédition annoncé par le vendeur ; null tant qu''il ne l''a pas renseigné.';

-- Le vendeur décrit son annonce, donc il choisit son format. La migration
-- 0010 a fermé l''écriture des colonnes une à une : sans cette ligne, la
-- colonne serait en lecture seule depuis l''application.
grant update (parcel_size) on listings to authenticated;

-- ---------------------------------------------------------------------------
-- Où va le colis
--
-- L'adresse est recopiée sur la commande plutôt que rangée sur le profil :
-- une adresse de livraison appartient à une commande, elle ne doit pas
-- changer rétroactivement parce que l'acheteur a déménagé depuis.
-- ---------------------------------------------------------------------------

alter table orders
  add column ship_to_name text,
  add column ship_to_address text,
  add column ship_to_zip text,
  add column ship_to_city text,
  add column ship_to_country text not null default 'FR',
  add column ship_to_phone text,
  -- 'home' à domicile, 'relay' en point relais, 'hand' remise en main propre.
  add column shipping_mode text not null default 'hand'
    check (shipping_mode in ('home', 'relay', 'hand')),
  add column relay_code text,
  add column relay_label text,
  -- L'offre retenue au moment de l'achat, telle que Boxtal l'a nommée.
  add column carrier_operator text,
  add column carrier_service text;

-- Une livraison en point relais sans point relais n'est pas une livraison.
alter table orders add constraint orders_relay_needs_point
  check (shipping_mode <> 'relay' or relay_code is not null);

-- Une expédition sans adresse non plus.
alter table orders add constraint orders_shipping_needs_address
  check (
    shipping_mode = 'hand'
    or (ship_to_name is not null and ship_to_address is not null
        and ship_to_zip is not null and ship_to_city is not null)
  );

-- ---------------------------------------------------------------------------
-- L'étiquette
--
-- Une ligne par commande expédiée. La référence Boxtal fait foi : c'est elle
-- qui permet de retrouver l'étiquette et le suivi, et son unicité empêche
-- d'acheter deux fois la même expédition.
-- ---------------------------------------------------------------------------

create table shipments (
  order_id uuid primary key references orders(id) on delete cascade,

  reference text not null unique,
  operator_code text not null,
  operator_label text not null,
  service_code text not null,
  service_label text not null,

  -- Ce que l'étiquette a coûté à la plateforme, en centimes. À comparer au
  -- port facturé à l'acheteur : c'est là qu'on voit si la grille dérive.
  cost_amount integer not null default 0 check (cost_amount >= 0),

  label_url text,
  tracking_number text,
  -- Dernier état connu, tel que Boxtal le pousse. Texte libre : chaque
  -- transporteur a son vocabulaire, on ne prétend pas le normaliser.
  tracking_status text,
  tracking_updated_at timestamptz,

  created_at timestamptz not null default now()
);

create index shipments_reference_idx on shipments (reference);

alter table shipments enable row level security;

-- Une expédition ne regarde que les deux parties de sa commande. Aucune
-- écriture depuis l'application : seule la fonction Edge, qui porte la clé
-- Boxtal, en crée.
create policy shipments_read on shipments for select
  using (
    exists (
      select 1 from orders o
      where o.id = shipments.order_id
        and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Le geste du vendeur change
--
-- Quand une étiquette existe, ce n'est plus au vendeur de saisir un numéro de
-- suivi : il l'a déjà, et le recopier à la main ne ferait qu'introduire des
-- fautes de frappe. La fonction accepte donc les deux cas — étiquette
-- achetée, ou envoi débrouillé par le vendeur — mais refuse d'écraser un
-- suivi venu du transporteur.
-- ---------------------------------------------------------------------------

create or replace function mark_order_shipped(
  order_id uuid,
  carrier text default null,
  tracking text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  etiquette shipments%rowtype;
begin
  select * into etiquette from shipments s where s.order_id = mark_order_shipped.order_id;

  update orders set
    status = 'shipped',
    tracking_carrier = coalesce(
      etiquette.operator_label,
      nullif(trim(coalesce(carrier, '')), '')
    ),
    tracking_number = coalesce(
      etiquette.tracking_number,
      nullif(trim(coalesce(tracking, '')), '')
    ),
    shipped_at = now(),
    updated_at = now()
  where id = mark_order_shipped.order_id
    and seller_id = auth.uid()
    and status = 'paid';

  if not found then
    raise exception 'Commande introuvable, ou pas au stade de l''expédition.';
  end if;
end;
$$;

comment on function mark_order_shipped is
  'Déclare l''envoi ; le suivi de l''étiquette achetée prend le pas sur la saisie.';
