-- L'assurance des envois par transporteur.
--
-- La fonction qui achète les étiquettes envoyait `assurance.selection: false`
-- depuis le premier jour. Ce n'était pas un oubli : l'option réclame une
-- déclaration d'emballage que nous ne savions pas encore obtenir du vendeur.
-- Elle l'est maintenant, et le refus n'a plus de raison d'être.
--
-- Ce que cela change dans les comptes : le port encaissé auprès de l'acheteur
-- couvre désormais le transport *et* sa couverture. On garde les deux montants
-- distincts — `shipping_amount` reste le total réglé, `insurance_amount` en
-- isole la part d'assurance — pour que la facture se relise et que la
-- contrainte de cohérence des totaux n'ait pas à bouger.
--
-- Un mot sur le montage, parce qu'il ressemble à celui du fonds de garantie
-- sans en être le même : la police est souscrite par nous, sur notre compte
-- Boxtal, pour couvrir la dette que nous avons envers l'acheteur si le colis
-- se perd. L'acheteur n'est partie à rien ; il paie un port qui comprend la
-- couverture, comme il paierait un colis suivi. Nous ne distribuons donc pas
-- d'assurance, nous en achetons une.

alter table orders
  /** Part d'assurance comprise dans `shipping_amount`, en centimes. */
  add column insurance_amount integer not null default 0 check (insurance_amount >= 0);

-- Elle ne peut pas dépasser le port, dont elle fait partie.
alter table orders add constraint orders_assurance_incluse
  check (insurance_amount <= shipping_amount);

grant select (insurance_amount) on orders to authenticated;

-- Comment le vendeur a déclaré son colis emballé. Conservé parce que c'est la
-- déclaration sur laquelle l'assureur s'appuiera en cas de sinistre : elle
-- doit rester lisible après coup, et pas seulement au moment du clic.
alter table shipments
  add column packaging text check (packaging is null or packaging in ('carton', 'tube', 'valise')),
  add column insured_value integer check (insured_value is null or insured_value > 0);

comment on column orders.insurance_amount is
  'Part d''assurance comprise dans le port. Zéro sous le seuil, ou si l''offre ne la propose pas.';
comment on column shipments.packaging is
  'Emballage déclaré par le vendeur, tel que transmis à l''assureur.';
