-- Adresses d'expédition pour les vendeurs de démonstration.
--
-- Sans elles, aucune cotation n'aboutit : la fonction qui interroge les
-- transporteurs a besoin de savoir d'où part le colis. Ce sont des membres
-- fictifs, donc des adresses fictives — mais avec de vrais codes postaux,
-- sans quoi Boxtal refuserait de coter.
--
-- Les numéros de téléphone sont pris dans la plage 06 39 98 XX XX, réservée
-- par l'ARCEP à la fiction : aucun d'eux ne sonne chez quelqu'un.
--
-- La civilité reste à sa valeur par défaut. Les transporteurs n'acceptent que
-- « M » ou « Mme », et rien dans un prénom ne permet de la deviner ; sur des
-- personnages inventés, la question ne se pose pas.

insert into seller_addresses (user_id, full_name, address, zip, city, country, phone)
values
  ('d0000000-0000-4000-a000-000000000001', 'Léa Vasseur',       '14 rue de la Cible',        '34000', 'Montpellier', 'FR', '0639980001'),
  ('d0000000-0000-4000-a000-000000000002', 'Camille Fournier',  '3 chemin du Pas de Tir',    '74000', 'Annecy',      'FR', '0639980002'),
  ('d0000000-0000-4000-a000-000000000003', 'Thomas Vidal',      '27 avenue des Archers',     '31000', 'Toulouse',    'FR', '0639980003'),
  ('d0000000-0000-4000-a000-000000000004', 'Sofia Marchetti',   '8 rue du Blason',           '69003', 'Lyon',        'FR', '0639980004'),
  ('d0000000-0000-4000-a000-000000000005', 'Yann Le Gall',      '52 rue des Trois Flèches',  '35000', 'Rennes',      'FR', '0639980005'),
  ('d0000000-0000-4000-a000-000000000006', 'Nadia Berthier',    '11 place de la Corde',      '59000', 'Lille',       'FR', '0639980006'),
  ('d0000000-0000-4000-a000-000000000007', 'Julien Pastor',     '6 rue du Carquois',         '33000', 'Bordeaux',    'FR', '0639980007'),
  ('d0000000-0000-4000-a000-000000000008', 'Marine Dubreuil',   '19 rue de la Poulie',       '44000', 'Nantes',      'FR', '0639980008'),
  ('d0000000-0000-4000-a000-000000000009', 'Pierre Aymard',     '4 allée du Berger',         '38000', 'Grenoble',    'FR', '0639980009')
on conflict (user_id) do update set
  full_name = excluded.full_name,
  address   = excluded.address,
  zip       = excluded.zip,
  city      = excluded.city,
  phone     = excluded.phone,
  updated_at = now();

-- Le format du colis, sans quoi tout partirait au format moyen — et une paire
-- de branches de 90 cm proposée dans un carton de 60 cm ferait échouer
-- l'étiquette après le paiement.
update listings set parcel_size = case
  when category in ('sight', 'release', 'protection', 'string', 'tools', 'arrow-parts') then 'small'
  when category in ('limbs', 'arrows', 'stabilizer', 'quiver')                          then 'long'
  when category in ('bow-recurve', 'bow-compound', 'bow-longbow', 'target')             then 'xl'
  else 'medium'
end::parcel_size
where shipping and parcel_size is null;
