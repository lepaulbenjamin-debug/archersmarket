-- Jeu de démonstration d'Archers Market.
--
-- Peuple la base d'un marché crédible : membres, annonces couvrant les douze
-- catégories, ventes conclues, avis, favoris et conversations. Sert aux
-- captures d'écran, à la recette sur TestFlight et à la revue Apple.
--
-- Réversible : toutes les lignes créées ici portent un identifiant qui commence
-- par d0 à d4. supabase/seed/demo_clean.sql les efface, et rien d'autre.
-- Réexécutable : chaque insertion est idempotente.
--
--   d0… membres      d1… annonces     d2… conversations
--   d3… messages     d4… avis
--
-- Un seul compte est connectable — celui laissé à la revue Apple :
--   demo@archersmarket.fr / ArchersDemo2026!
-- Les autres membres reçoivent un mot de passe aléatoire : ils existent pour
-- animer le marché, pas pour être empruntés.

begin;

-- ---------------------------------------------------------------------------
-- Membres
-- ---------------------------------------------------------------------------

-- Le trigger handle_new_user crée le profil à partir des métadonnées.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000',
  member.id,
  'authenticated',
  'authenticated',
  member.email,
  extensions.crypt(member.password, extensions.gen_salt('bf')),
  now() - (member.seniority || ' days')::interval,
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object(
    'name', member.name,
    'handle', member.handle,
    'city', member.city,
    'club', member.club
  ),
  now() - (member.seniority || ' days')::interval,
  now(),
  '', '', '', ''
from (values
  ('d0000000-0000-4000-a000-000000000001'::uuid, 'demo@archersmarket.fr',
   'ArchersDemo2026!', 'Léa Vasseur', 'lea_vasseur', 'Montpellier',
   'Arc Club de Montpellier', 410),
  ('d0000000-0000-4000-a000-000000000002'::uuid, 'camille@demo.archersmarket.fr',
   gen_random_uuid()::text, 'Camille Fournier', 'camille_fournier', 'Annecy',
   'Compagnie d''Arc d''Annecy', 880),
  ('d0000000-0000-4000-a000-000000000003'::uuid, 'thomas@demo.archersmarket.fr',
   gen_random_uuid()::text, 'Thomas Vidal', 'thomas_vidal', 'Toulouse',
   'Arc Club Toulousain', 640),
  ('d0000000-0000-4000-a000-000000000004'::uuid, 'sofia@demo.archersmarket.fr',
   gen_random_uuid()::text, 'Sofia Marchetti', 'sofia_marchetti', 'Lyon',
   'Les Archers de Gerland', 520),
  ('d0000000-0000-4000-a000-000000000005'::uuid, 'yann@demo.archersmarket.fr',
   gen_random_uuid()::text, 'Yann Le Gall', 'yann_le_gall', 'Rennes',
   'Compagnie d''Arc de Rennes', 1240),
  ('d0000000-0000-4000-a000-000000000006'::uuid, 'nadia@demo.archersmarket.fr',
   gen_random_uuid()::text, 'Nadia Berthier', 'nadia_berthier', 'Strasbourg',
   'Archers de la Robertsau', 300),
  ('d0000000-0000-4000-a000-000000000007'::uuid, 'julien@demo.archersmarket.fr',
   gen_random_uuid()::text, 'Julien Pastor', 'julien_pastor', 'Bordeaux',
   'Les Archers du Médoc', 760),
  ('d0000000-0000-4000-a000-000000000008'::uuid, 'marine@demo.archersmarket.fr',
   gen_random_uuid()::text, 'Marine Dubreuil', 'marine_dubreuil', 'Nantes',
   'Compagnie d''Arc de Nantes', 1580),
  ('d0000000-0000-4000-a000-000000000009'::uuid, 'pierre@demo.archersmarket.fr',
   gen_random_uuid()::text, 'Pierre Aymard', 'pierre_aymard', 'Grenoble',
   'Arc Alpin Grenoble', 950)
) as member(id, email, password, name, handle, city, club, seniority)
on conflict (id) do nothing;

-- Ce que le formulaire d'inscription ne demande pas.
update profiles as p set
  bio = m.bio,
  discipline = m.discipline,
  created_at = u.created_at
from (values
  ('d0000000-0000-4000-a000-000000000001'::uuid,
   'Je renouvelle mon matériel chaque saison, donc je revends souvent. Envois soignés sous 48 h.',
   'Arc classique — FITA & salle'),
  ('d0000000-0000-4000-a000-000000000002'::uuid,
   'Archère classique depuis douze ans. Je ne vends que du matériel que j''ai utilisé moi-même, et je le dis quand il a vécu.',
   'Arc classique — salle & FITA'),
  ('d0000000-0000-4000-a000-000000000003'::uuid,
   'Compound en 3D et en salle. Je démonte, je règle, j''explique — n''hésitez pas à demander des photos supplémentaires.',
   'Arc à poulies — 3D & salle'),
  ('d0000000-0000-4000-a000-000000000004'::uuid,
   'Tir en campagne principalement. Je vends ce dont je ne me sers plus, prix ferme mais honnête.',
   'Arc classique — tir en campagne'),
  ('d0000000-0000-4000-a000-000000000005'::uuid,
   'Je fabrique mes cordes et je répare pas mal de choses. Remise en main propre possible sur Rennes.',
   'Arc nu (barebow)'),
  ('d0000000-0000-4000-a000-000000000006'::uuid,
   'Jeune adulte en club, je revends le matériel devenu trop léger au fil des progrès.',
   'Arc classique — jeune adulte'),
  ('d0000000-0000-4000-a000-000000000007'::uuid,
   'Compound en salle. Matériel toujours entretenu, cordes changées régulièrement.',
   'Arc à poulies — salle'),
  ('d0000000-0000-4000-a000-000000000008'::uuid,
   'Arc traditionnel et longbow. Je fabrique aussi quelques flèches en bois sur mesure.',
   'Arc traditionnel & longbow'),
  ('d0000000-0000-4000-a000-000000000009'::uuid,
   'Campagne et arc nu en montagne. Le matériel que je vends a servi, c''est écrit dans les annonces.',
   'Tir en campagne — arc nu')
) as m(id, bio, discipline)
join auth.users u on u.id = m.id
where p.id = m.id;

-- ---------------------------------------------------------------------------
-- Annonces
--
-- Les douze catégories sont représentées. Les prix, marques et modèles
-- correspondent au marché français de l'occasion.
-- ---------------------------------------------------------------------------

insert into listings (
  id, seller_id, title, description, price, original_price, category, brand,
  condition, hand, draw_weight, bow_length, draw_length, spine, size, city,
  shipping, shipping_price, status, views, created_at, updated_at
)
select
  l.id, l.seller_id, l.title, l.description, l.price, l.original_price,
  l.category::listing_category, l.brand, l.condition::listing_condition,
  l.hand::handedness, l.draw_weight, l.bow_length, l.draw_length, l.spine,
  l.size, l.city, l.shipping, l.shipping_price, l.status::listing_status,
  l.views, now() - (l.age_days || ' days')::interval,
  now() - (l.age_days || ' days')::interval
from (values
  -- Arcs classiques ---------------------------------------------------------
  ('d1000000-0000-4000-a000-000000000001'::uuid, 'd0000000-0000-4000-a000-000000000002'::uuid,
   'Poignée Hoyt Formula Xi 25" droitier',
   'Poignée Formula Xi en 25 pouces, droitier, couleur graphite. Servie deux saisons en salle et sur FITA, aucun choc, filetages impeccables. Vendue avec sa clé et son berger d''origine, sans branches.',
   420, 690, 'bow-recurve', 'Hoyt', 'very-good', 'right', null, 25, null, null, null,
   'Annecy', true, 12, 'active', 312, 4),
  ('d1000000-0000-4000-a000-000000000002'::uuid, 'd0000000-0000-4000-a000-000000000002'::uuid,
   'Branches Uukha VX+ 68" 38 lbs',
   'Branches carbone VX+ en 68 pouces, 38 livres sur poignée 25". Environ 4000 flèches tirées, aucun délaminage, pas de torsion. Les photos supplémentaires sont possibles sur demande.',
   490, 780, 'bow-recurve', 'Uukha', 'very-good', 'na', 38, 68, null, null, null,
   'Annecy', true, 14, 'active', 268, 9),
  ('d1000000-0000-4000-a000-000000000003'::uuid, 'd0000000-0000-4000-a000-000000000004'::uuid,
   'Arc complet Win&Win Wiawis One 70" 32 lbs',
   'Ensemble complet : poignée Wiawis One 25" droitier et branches 32 livres en 70 pouces. Bon état général, quelques marques d''usage sur la poignée, branches saines. Corde neuve montée.',
   620, null, 'bow-recurve', 'Win&Win', 'good', 'right', 32, 70, null, null, null,
   'Lyon', true, 18, 'active', 197, 12),
  ('d1000000-0000-4000-a000-000000000004'::uuid, 'd0000000-0000-4000-a000-000000000009'::uuid,
   'Poignée Gillo GT27 rouge 27"',
   'GT27 en 27 pouces, rouge anodisé, droitier. Achetée l''an dernier, très peu servie — je repasse sur du 25". Livrée avec les masselottes et la visserie complète.',
   540, 640, 'bow-recurve', 'Gillo', 'like-new', 'right', null, 27, null, null, null,
   'Grenoble', true, 15, 'active', 141, 6),
  ('d1000000-0000-4000-a000-000000000005'::uuid, 'd0000000-0000-4000-a000-000000000006'::uuid,
   'Branches MK Korea Veracity 68" 30 lbs',
   'Branches Veracity 30 livres en 68 pouces. Très bon état, servies une saison en club. Je passe en 34 livres, d''où la vente.',
   260, 390, 'bow-recurve', 'MK Korea', 'very-good', 'na', 30, 68, null, null, null,
   'Strasbourg', true, 12, 'sold', 224, 38),
  ('d1000000-0000-4000-a000-000000000006'::uuid, 'd0000000-0000-4000-a000-000000000008'::uuid,
   'Arc initiation Samick Sage 62" 24 lbs',
   'Arc démontable idéal pour débuter, 24 livres en 62 pouces, droitier. Bon état, quelques rayures sur la poignée bois. Corde et repose-flèche inclus.',
   95, null, 'bow-recurve', 'Samick', 'good', 'right', 24, 62, null, null, null,
   'Nantes', true, 10, 'sold', 386, 45),

  -- Arcs à poulies ----------------------------------------------------------
  ('d1000000-0000-4000-a000-000000000007'::uuid, 'd0000000-0000-4000-a000-000000000003'::uuid,
   'Mathews Lift 29,5" 60 lbs gaucher',
   'Mathews Lift gaucher, allonge 29,5 pouces, 60 livres. Comme neuf, servi une demi-saison en 3D. Cordes d''origine en parfait état, décocheur non inclus. Prix à débattre pour un achat rapide.',
   1450, 1890, 'bow-compound', 'Mathews', 'like-new', 'left', 60, null, 29.5, null, null,
   'Toulouse', true, 20, 'active', 431, 3),
  ('d1000000-0000-4000-a000-000000000008'::uuid, 'd0000000-0000-4000-a000-000000000007'::uuid,
   'Arc à poulies PSE Citation 42 droitier',
   'Citation 42 droitier, 50 livres, allonge réglable autour de 28 pouces. Très bon état, utilisé en salle uniquement. Cordes changées il y a six mois.',
   690, 980, 'bow-compound', 'PSE', 'very-good', 'right', 50, null, 28, null, null,
   'Bordeaux', true, 22, 'active', 176, 16),
  ('d1000000-0000-4000-a000-000000000009'::uuid, 'd0000000-0000-4000-a000-000000000003'::uuid,
   'Elite Ember jeune archer 40 lbs',
   'Arc évolutif pour jeune archer, 40 livres maximum, allonge réglable de 21 à 30 pouces. Bon état, traces d''usage normales. Parfait pour accompagner la croissance sans racheter.',
   380, 520, 'bow-compound', 'Elite', 'good', 'right', 40, null, 26, null, null,
   'Toulouse', true, 18, 'active', 88, 21),

  -- Traditionnel ------------------------------------------------------------
  ('d1000000-0000-4000-a000-000000000010'::uuid, 'd0000000-0000-4000-a000-000000000008'::uuid,
   'Longbow Bear Montana 64" 45 lbs',
   'Bear Montana en 64 pouces, 45 livres à 28. Très bon état, bois sans fente ni éclat. Corde Dacron récente. Un vrai plaisir en instinctif.',
   210, 290, 'bow-longbow', 'Bear Archery', 'very-good', 'right', 45, 64, null, null, null,
   'Nantes', true, 14, 'active', 203, 7),
  ('d1000000-0000-4000-a000-000000000011'::uuid, 'd0000000-0000-4000-a000-000000000008'::uuid,
   'Arc droit artisanal frêne et bambou 68" 40 lbs',
   'Arc droit fabriqué à la main, frêne et bambou, 68 pouces pour 40 livres à 28. Bon état, une petite reprise de vernis sur la poignée. Tir doux, aucune vibration.',
   180, null, 'bow-longbow', 'Autre', 'good', 'right', 40, 68, null, null, null,
   'Nantes', false, null, 'active', 129, 24),

  -- Flèches -----------------------------------------------------------------
  ('d1000000-0000-4000-a000-000000000012'::uuid, 'd0000000-0000-4000-a000-000000000002'::uuid,
   'Flèches Easton X10 spine 550 — lot de 12',
   'Douze X10 en spine 550, coupées à 28,5 pouces, pointes 110 grains. Comme neuves, tirées une saison en salle. Plumes Spin-Wing changées récemment.',
   240, 340, 'arrows', 'Easton', 'like-new', 'na', null, null, null, 550, null,
   'Annecy', true, 8, 'sold', 291, 52),
  ('d1000000-0000-4000-a000-000000000013'::uuid, 'd0000000-0000-4000-a000-000000000004'::uuid,
   'Flèches Skylon Preminens spine 500 — lot de 8',
   'Huit tubes Preminens en 500, neufs, jamais montés. Vendus nus, sans pointes ni empennage. J''en avais commandé trop.',
   95, null, 'arrows', 'Skylon', 'new', 'na', null, null, null, 500, null,
   'Lyon', true, 7, 'sold', 164, 41),
  ('d1000000-0000-4000-a000-000000000014'::uuid, 'd0000000-0000-4000-a000-000000000007'::uuid,
   'Tubes Victory VAP 600 — lot de 12',
   'Douze VAP en spine 600, très bon état, coupés à 29 pouces. Deux tubes ont une légère marque cosmétique, sans incidence sur le vol.',
   70, 110, 'arrows', 'Victory', 'very-good', 'na', null, null, null, 600, null,
   'Bordeaux', true, 8, 'sold', 118, 47),
  ('d1000000-0000-4000-a000-000000000015'::uuid, 'd0000000-0000-4000-a000-000000000008'::uuid,
   'Flèches bois cèdre 11/32 — lot de 6',
   'Six flèches en cèdre, diamètre 11/32, plumes naturelles taillées bouclier. Bon état, faites main. Idéal pour un longbow autour de 40 livres.',
   45, null, 'arrows', 'Autre', 'good', 'na', null, null, null, null, null,
   'Nantes', true, 7, 'active', 74, 11),

  -- Viseurs et accessoires de visée -----------------------------------------
  ('d1000000-0000-4000-a000-000000000016'::uuid, 'd0000000-0000-4000-a000-000000000005'::uuid,
   'Viseur Shibuya Ultima RC 520 droitier',
   'Ultima RC en 520 mm, droitier, avec sa dérive et son scope 29 mm. Très bon état, mouvements francs, aucun jeu. Vendu dans sa boîte d''origine.',
   210, 330, 'sight', 'Shibuya', 'very-good', 'right', null, null, null, null, null,
   'Rennes', true, 10, 'sold', 247, 34),
  ('d1000000-0000-4000-a000-000000000017'::uuid, 'd0000000-0000-4000-a000-000000000003'::uuid,
   'Viseur Axcel Achieve XP droitier',
   'Achieve XP droitier, comme neuf, monté trois mois. Micro-réglages parfaits, vendu avec la barre de 9 pouces et la notice.',
   320, 430, 'sight', 'Axcel', 'like-new', 'right', null, null, null, null, null,
   'Toulouse', true, 10, 'active', 158, 8),
  ('d1000000-0000-4000-a000-000000000018'::uuid, 'd0000000-0000-4000-a000-000000000009'::uuid,
   'Scope Beiter 29 mm avec lentille 0,5 dioptrie',
   'Scope Beiter 29 mm, très bon état, avec lentille 0,5 D et deux viseurs de rechange (2 mm et 3 mm). Aucune rayure sur la lentille.',
   85, 130, 'sight', 'Beiter', 'very-good', 'na', null, null, null, null, null,
   'Grenoble', true, 6, 'active', 96, 14),
  ('d1000000-0000-4000-a000-000000000019'::uuid, 'd0000000-0000-4000-a000-000000000006'::uuid,
   'Berger button Beiter et repose-flèche',
   'Palpeur Beiter en bon état avec ses ressorts de rechange, plus un repose-flèche magnétique. Fonctionne parfaitement, quelques marques de serrage.',
   55, null, 'sight', 'Beiter', 'good', 'na', null, null, null, null, null,
   'Strasbourg', true, 6, 'active', 63, 19),

  -- Stabilisation -----------------------------------------------------------
  ('d1000000-0000-4000-a000-000000000020'::uuid, 'd0000000-0000-4000-a000-000000000004'::uuid,
   'Stabilisation complète Arc Systeme 30" + 12"',
   'Ensemble complet : longue tige 30 pouces, deux latérales 12 pouces, V-bar et amortisseurs. Très bon état, carbone sans éclat. Masselottes incluses.',
   190, 310, 'stabilizer', 'Arc Systeme', 'very-good', 'na', null, null, null, null, '30" + 12"',
   'Lyon', true, 12, 'active', 134, 10),
  ('d1000000-0000-4000-a000-000000000021'::uuid, 'd0000000-0000-4000-a000-000000000007'::uuid,
   'V-bar Cartel et amortisseurs',
   'V-bar réglable Cartel avec deux amortisseurs. Bon état, filetages propres. Une rayure sur le corps, purement esthétique.',
   45, null, 'stabilizer', 'Cartel', 'good', 'na', null, null, null, null, 'Standard',
   'Bordeaux', true, 7, 'sold', 81, 43),

  -- Décocheurs et palettes ---------------------------------------------------
  ('d1000000-0000-4000-a000-000000000022'::uuid, 'd0000000-0000-4000-a000-000000000005'::uuid,
   'Palette Fivics Saker II taille M',
   'Palette Saker II en taille M, cuir de bonne épaisseur, très bon état. Servie une saison, la platine ne présente aucune usure. Idéale en arc classique.',
   65, 95, 'release', 'Fivics', 'very-good', 'right', null, null, null, null, 'M',
   'Rennes', true, 6, 'active', 112, 13),
  ('d1000000-0000-4000-a000-000000000023'::uuid, 'd0000000-0000-4000-a000-000000000006'::uuid,
   'Onglet Cartel taille S',
   'Onglet trois doigts en taille S, bon état, cuir assoupli. Convient à une main fine, débutant ou jeune archer.',
   18, null, 'release', 'Cartel', 'good', 'right', null, null, null, null, 'S',
   'Strasbourg', true, 5, 'sold', 57, 49),

  -- Carquois ----------------------------------------------------------------
  ('d1000000-0000-4000-a000-000000000024'::uuid, 'd0000000-0000-4000-a000-000000000009'::uuid,
   'Carquois de terrain Legend avec ceinture',
   'Carquois de hanche Legend, très bon état, quatre tubes et deux poches zippées. Ceinture réglable incluse, couture intacte.',
   40, 65, 'quiver', 'Legend', 'very-good', 'right', null, null, null, null, null,
   'Grenoble', true, 8, 'active', 91, 17),
  ('d1000000-0000-4000-a000-000000000025'::uuid, 'd0000000-0000-4000-a000-000000000008'::uuid,
   'Carquois de dos traditionnel en cuir',
   'Carquois de dos en cuir pleine fleur, patiné par l''usage. Bon état, bandoulière solide, une couture reprise à la main. Parfait en traditionnel.',
   55, null, 'quiver', 'Autre', 'good', 'na', null, null, null, null, null,
   'Nantes', true, 9, 'active', 148, 20),

  -- Protections -------------------------------------------------------------
  ('d1000000-0000-4000-a000-000000000026'::uuid, 'd0000000-0000-4000-a000-000000000001'::uuid,
   'Protège-bras et plastron Avalon taille M',
   'Ensemble protège-bras long et plastron Avalon en taille M, comme neufs, portés une saison en salle. Sangles en parfait état.',
   35, 55, 'protection', 'Avalon', 'like-new', 'na', null, null, null, null, 'M',
   'Montpellier', true, 6, 'active', 79, 5),
  ('d1000000-0000-4000-a000-000000000027'::uuid, 'd0000000-0000-4000-a000-000000000006'::uuid,
   'Protège-doigts et dragonne Decut',
   'Dragonne de poignet Decut en cuir et protège-doigts assorti. Bon état, réglages fonctionnels.',
   22, null, 'protection', 'Decut', 'good', 'na', null, null, null, null, 'Unique',
   'Strasbourg', true, 5, 'active', 44, 27),

  -- Cordes ------------------------------------------------------------------
  ('d1000000-0000-4000-a000-000000000028'::uuid, 'd0000000-0000-4000-a000-000000000005'::uuid,
   'Corde Fastflight 68" 16 brins tressée main',
   'Corde neuve tressée à la main en Fastflight, 16 brins pour arc de 68 pouces. Tranche-fil noir et orange, boucles servies. Je peux ajuster la longueur avant envoi.',
   35, null, 'string', 'Autre', 'new', 'na', null, 68, null, null, null,
   'Rennes', true, 5, 'active', 106, 2),
  ('d1000000-0000-4000-a000-000000000029'::uuid, 'd0000000-0000-4000-a000-000000000005'::uuid,
   'Bobines de tranche-fil et fil de service',
   'Deux bobines de tranche-fil (noir et orange) et une bobine de fil de service, neuves, jamais entamées. De quoi refaire plusieurs cordes.',
   20, null, 'string', 'Autre', 'new', 'na', null, null, null, null, null,
   'Rennes', true, 5, 'active', 38, 30),

  -- Cibles ------------------------------------------------------------------
  ('d1000000-0000-4000-a000-000000000030'::uuid, 'd0000000-0000-4000-a000-000000000009'::uuid,
   'Cible mousse 60 x 60 avec trépied',
   'Cible en mousse compressée 60 x 60 cm, bon état, un côté encore neuf. Trépied métal pliant inclus. À récupérer sur place, trop encombrant pour un envoi.',
   90, 150, 'target', 'Autre', 'good', 'na', null, null, null, null, '60 x 60 cm',
   'Grenoble', false, null, 'active', 167, 15),
  ('d1000000-0000-4000-a000-000000000031'::uuid, 'd0000000-0000-4000-a000-000000000001'::uuid,
   'Blasons 40 cm — lot de 50',
   'Lot de cinquante blasons 40 cm neufs, sous emballage. Achetés pour le club, il m''en reste trop.',
   25, null, 'target', 'Autre', 'new', 'na', null, null, null, null, '40 cm',
   'Montpellier', true, 8, 'active', 52, 23),

  -- Textile et bagagerie ----------------------------------------------------
  ('d1000000-0000-4000-a000-000000000032'::uuid, 'd0000000-0000-4000-a000-000000000001'::uuid,
   'Housse d''arc classique Avalon Tec X 70"',
   'Housse Avalon Tec X pour arc classique démonté, jusqu''à 70 pouces. Très bon état, fermetures fluides, poche à flèches intacte.',
   60, 95, 'apparel', 'Avalon', 'very-good', 'na', null, null, null, null, '70"',
   'Montpellier', true, 12, 'reserved', 87, 18),
  ('d1000000-0000-4000-a000-000000000033'::uuid, 'd0000000-0000-4000-a000-000000000003'::uuid,
   'Valise arc à poulies Legend Everest',
   'Valise rigide Legend Everest, très bon état, mousses intactes et roulettes en bon état. Deux serrures à code fonctionnelles.',
   140, 230, 'apparel', 'Legend', 'very-good', 'na', null, null, null, null, 'Compound',
   'Toulouse', true, 25, 'active', 121, 26),
  ('d1000000-0000-4000-a000-000000000034'::uuid, 'd0000000-0000-4000-a000-000000000004'::uuid,
   'Sac de terrain Decut',
   'Sac de terrain Decut, bon état, sangles solides, quelques traces d''herbe qui partent au lavage. Grand volume, pratique en extérieur.',
   45, null, 'apparel', 'Decut', 'good', 'na', null, null, null, null, 'Unique',
   'Lyon', true, 10, 'reserved', 68, 22),

  -- Deux ventes déjà conclues, pour que les vendeurs les plus en vue aient un
  -- historique et une note.
  ('d1000000-0000-4000-a000-000000000035'::uuid, 'd0000000-0000-4000-a000-000000000003'::uuid,
   'Décocheur à poignée trois doigts',
   'Décocheur à poignée trois doigts, détente réglable, très bon état. Servi une saison en salle, dragonne en cuir incluse.',
   110, 165, 'release', 'Autre', 'very-good', 'right', null, null, null, null, 'Standard',
   'Toulouse', true, 6, 'sold', 143, 51),
  ('d1000000-0000-4000-a000-000000000036'::uuid, 'd0000000-0000-4000-a000-000000000009'::uuid,
   'Trépied de cible pliant',
   'Trépied métal pliant pour cible jusqu''à 80 cm, bon état, un pied légèrement voilé sans conséquence sur la stabilité. Se range à plat.',
   35, null, 'target', 'Autre', 'good', 'na', null, null, null, null, 'Jusqu''à 80 cm',
   'Grenoble', false, null, 'sold', 62, 56),
  -- Une vente au compte de démonstration, pour que son écran Compte ne montre
  -- pas un historique vide.
  ('d1000000-0000-4000-a000-000000000037'::uuid, 'd0000000-0000-4000-a000-000000000001'::uuid,
   'Branches Kinetic Vygo 68" 26 lbs',
   'Branches Vygo en 68 pouces, 26 livres, très bon état. Servies une saison en salle avant de passer sur du plus lourd. Aucune torsion.',
   130, 190, 'bow-recurve', 'Kinetic', 'very-good', 'na', 26, 68, null, null, null,
   'Montpellier', true, 12, 'sold', 174, 58)
) as l(id, seller_id, title, description, price, original_price, category, brand,
       condition, hand, draw_weight, bow_length, draw_length, spine, size, city,
       shipping, shipping_price, status, views, age_days)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Ventes conclues
--
-- Le vendeur désigne l'acheteur en marquant l'annonce vendue ; c'est ce qui
-- ouvre le droit de laisser un avis.
-- ---------------------------------------------------------------------------

update listings as l set buyer_id = s.buyer_id
from (values
  ('d1000000-0000-4000-a000-000000000005'::uuid, 'd0000000-0000-4000-a000-000000000001'::uuid),
  ('d1000000-0000-4000-a000-000000000006'::uuid, 'd0000000-0000-4000-a000-000000000006'::uuid),
  ('d1000000-0000-4000-a000-000000000012'::uuid, 'd0000000-0000-4000-a000-000000000004'::uuid),
  ('d1000000-0000-4000-a000-000000000013'::uuid, 'd0000000-0000-4000-a000-000000000001'::uuid),
  ('d1000000-0000-4000-a000-000000000014'::uuid, 'd0000000-0000-4000-a000-000000000005'::uuid),
  ('d1000000-0000-4000-a000-000000000016'::uuid, 'd0000000-0000-4000-a000-000000000002'::uuid),
  ('d1000000-0000-4000-a000-000000000021'::uuid, 'd0000000-0000-4000-a000-000000000009'::uuid),
  ('d1000000-0000-4000-a000-000000000023'::uuid, 'd0000000-0000-4000-a000-000000000008'::uuid),
  ('d1000000-0000-4000-a000-000000000035'::uuid, 'd0000000-0000-4000-a000-000000000009'::uuid),
  ('d1000000-0000-4000-a000-000000000036'::uuid, 'd0000000-0000-4000-a000-000000000008'::uuid),
  ('d1000000-0000-4000-a000-000000000037'::uuid, 'd0000000-0000-4000-a000-000000000006'::uuid)
) as s(listing_id, buyer_id)
where l.id = s.listing_id;

-- ---------------------------------------------------------------------------
-- Avis
--
-- Le trigger refresh_profile_rating recalcule les notes des profils.
-- Volontairement, la vente d1…13 n'est notée que par le vendeur : le compte de
-- démonstration a donc un avis à déposer, ce que l'écran Compte met en avant.
-- ---------------------------------------------------------------------------

insert into reviews (id, listing_id, author_id, subject_id, rating, comment, created_at)
select r.id, r.listing_id, r.author_id, r.subject_id, r.rating, r.comment,
       now() - (r.age_days || ' days')::interval
from (values
  ('d4000000-0000-4000-a000-000000000001'::uuid, 'd1000000-0000-4000-a000-000000000005'::uuid,
   'd0000000-0000-4000-a000-000000000001'::uuid, 'd0000000-0000-4000-a000-000000000006'::uuid,
   5, 'Branches conformes à l''annonce, emballage impeccable, envoi le lendemain. Rien à redire.', 33),
  ('d4000000-0000-4000-a000-000000000002'::uuid, 'd1000000-0000-4000-a000-000000000005'::uuid,
   'd0000000-0000-4000-a000-000000000006'::uuid, 'd0000000-0000-4000-a000-000000000001'::uuid,
   5, 'Échange très clair, paiement immédiat. Acheteuse à recommander.', 32),
  ('d4000000-0000-4000-a000-000000000003'::uuid, 'd1000000-0000-4000-a000-000000000006'::uuid,
   'd0000000-0000-4000-a000-000000000006'::uuid, 'd0000000-0000-4000-a000-000000000008'::uuid,
   5, 'Arc parfait pour débuter, encore mieux que sur les photos. Marine a pris le temps de tout expliquer.', 40),
  ('d4000000-0000-4000-a000-000000000004'::uuid, 'd1000000-0000-4000-a000-000000000012'::uuid,
   'd0000000-0000-4000-a000-000000000004'::uuid, 'd0000000-0000-4000-a000-000000000002'::uuid,
   5, 'Des X10 vraiment comme neuves, spine vérifié à réception. Vendeuse sérieuse.', 47),
  ('d4000000-0000-4000-a000-000000000005'::uuid, 'd1000000-0000-4000-a000-000000000012'::uuid,
   'd0000000-0000-4000-a000-000000000002'::uuid, 'd0000000-0000-4000-a000-000000000004'::uuid,
   5, 'Transaction fluide, aucune hésitation. Merci !', 46),
  ('d4000000-0000-4000-a000-000000000006'::uuid, 'd1000000-0000-4000-a000-000000000013'::uuid,
   'd0000000-0000-4000-a000-000000000004'::uuid, 'd0000000-0000-4000-a000-000000000001'::uuid,
   5, 'Réponse rapide et paiement dans la foulée. Un plaisir.', 36),
  ('d4000000-0000-4000-a000-000000000007'::uuid, 'd1000000-0000-4000-a000-000000000014'::uuid,
   'd0000000-0000-4000-a000-000000000005'::uuid, 'd0000000-0000-4000-a000-000000000007'::uuid,
   4, 'Tubes conformes, les deux marques annoncées sont bien là et ne gênent pas. Envoi un peu lent mais soigné.', 42),
  ('d4000000-0000-4000-a000-000000000008'::uuid, 'd1000000-0000-4000-a000-000000000016'::uuid,
   'd0000000-0000-4000-a000-000000000002'::uuid, 'd0000000-0000-4000-a000-000000000005'::uuid,
   5, 'Viseur nickel, boîte d''origine, réglages parfaits. Yann connaît son matériel.', 30),
  ('d4000000-0000-4000-a000-000000000009'::uuid, 'd1000000-0000-4000-a000-000000000016'::uuid,
   'd0000000-0000-4000-a000-000000000005'::uuid, 'd0000000-0000-4000-a000-000000000002'::uuid,
   5, 'Communication claire du début à la fin. Avec plaisir pour une prochaine fois.', 29),
  ('d4000000-0000-4000-a000-000000000010'::uuid, 'd1000000-0000-4000-a000-000000000021'::uuid,
   'd0000000-0000-4000-a000-000000000009'::uuid, 'd0000000-0000-4000-a000-000000000007'::uuid,
   4, 'Conforme, la rayure est bien celle des photos. Bon rapport qualité-prix.', 38),
  ('d4000000-0000-4000-a000-000000000011'::uuid, 'd1000000-0000-4000-a000-000000000023'::uuid,
   'd0000000-0000-4000-a000-000000000008'::uuid, 'd0000000-0000-4000-a000-000000000006'::uuid,
   5, 'Petit prix, grand sérieux. Envoi rapide.', 44),
  ('d4000000-0000-4000-a000-000000000012'::uuid, 'd1000000-0000-4000-a000-000000000035'::uuid,
   'd0000000-0000-4000-a000-000000000009'::uuid, 'd0000000-0000-4000-a000-000000000003'::uuid,
   5, 'Décocheur conforme, détente réglée avant l''envoi, ce qui n''était même pas demandé. Vendeur très sérieux.', 48),
  ('d4000000-0000-4000-a000-000000000013'::uuid, 'd1000000-0000-4000-a000-000000000035'::uuid,
   'd0000000-0000-4000-a000-000000000003'::uuid, 'd0000000-0000-4000-a000-000000000009'::uuid,
   5, 'Échange rapide et cordial, aucune mauvaise surprise.', 47),
  ('d4000000-0000-4000-a000-000000000014'::uuid, 'd1000000-0000-4000-a000-000000000036'::uuid,
   'd0000000-0000-4000-a000-000000000008'::uuid, 'd0000000-0000-4000-a000-000000000009'::uuid,
   4, 'Trépied bien décrit, le pied voilé ne gêne pas. Récupération sur place sans souci.', 52),
  ('d4000000-0000-4000-a000-000000000015'::uuid, 'd1000000-0000-4000-a000-000000000037'::uuid,
   'd0000000-0000-4000-a000-000000000006'::uuid, 'd0000000-0000-4000-a000-000000000001'::uuid,
   5, 'Branches exactement comme décrites, très bien emballées. Léa répond vite et clairement.', 54),
  ('d4000000-0000-4000-a000-000000000016'::uuid, 'd1000000-0000-4000-a000-000000000037'::uuid,
   'd0000000-0000-4000-a000-000000000001'::uuid, 'd0000000-0000-4000-a000-000000000006'::uuid,
   5, 'Acheteuse réactive et sympathique, paiement immédiat. Merci Nadia !', 53)
) as r(id, listing_id, author_id, subject_id, rating, comment, age_days)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Favoris du compte de démonstration
-- ---------------------------------------------------------------------------

insert into favorites (user_id, listing_id, created_at)
select 'd0000000-0000-4000-a000-000000000001'::uuid, f.listing_id,
       now() - (f.age_days || ' days')::interval
from (values
  ('d1000000-0000-4000-a000-000000000001'::uuid, 3),
  ('d1000000-0000-4000-a000-000000000004'::uuid, 5),
  ('d1000000-0000-4000-a000-000000000007'::uuid, 2),
  ('d1000000-0000-4000-a000-000000000017'::uuid, 6),
  ('d1000000-0000-4000-a000-000000000020'::uuid, 8),
  ('d1000000-0000-4000-a000-000000000024'::uuid, 12)
) as f(listing_id, age_days)
on conflict (user_id, listing_id) do nothing;

-- Quelques favoris ailleurs, pour que les compteurs ne soient pas tous à zéro.
insert into favorites (user_id, listing_id, created_at)
select u.id, l.listing_id, now() - (l.age_days || ' days')::interval
from (values
  ('d0000000-0000-4000-a000-000000000003'::uuid, 'd1000000-0000-4000-a000-000000000002'::uuid, 4),
  ('d0000000-0000-4000-a000-000000000004'::uuid, 'd1000000-0000-4000-a000-000000000001'::uuid, 7),
  ('d0000000-0000-4000-a000-000000000006'::uuid, 'd1000000-0000-4000-a000-000000000003'::uuid, 9),
  ('d0000000-0000-4000-a000-000000000009'::uuid, 'd1000000-0000-4000-a000-000000000007'::uuid, 2),
  ('d0000000-0000-4000-a000-000000000008'::uuid, 'd1000000-0000-4000-a000-000000000030'::uuid, 11)
) as l(user_id, listing_id, age_days)
join auth.users u on u.id = l.user_id
on conflict (user_id, listing_id) do nothing;

-- ---------------------------------------------------------------------------
-- Conversations
--
-- Le compte de démonstration apparaît des deux côtés : acheteur sur deux
-- annonces, vendeur sur une troisième.
-- ---------------------------------------------------------------------------

insert into conversations (id, listing_id, buyer_id, seller_id, created_at, updated_at)
select c.id, c.listing_id, c.buyer_id, c.seller_id,
       now() - (c.age_hours || ' hours')::interval,
       now() - (c.last_hours || ' hours')::interval
from (values
  ('d2000000-0000-4000-a000-000000000001'::uuid, 'd1000000-0000-4000-a000-000000000001'::uuid,
   'd0000000-0000-4000-a000-000000000001'::uuid, 'd0000000-0000-4000-a000-000000000002'::uuid, 52, 3),
  ('d2000000-0000-4000-a000-000000000002'::uuid, 'd1000000-0000-4000-a000-000000000007'::uuid,
   'd0000000-0000-4000-a000-000000000001'::uuid, 'd0000000-0000-4000-a000-000000000003'::uuid, 26, 19),
  ('d2000000-0000-4000-a000-000000000003'::uuid, 'd1000000-0000-4000-a000-000000000032'::uuid,
   'd0000000-0000-4000-a000-000000000003'::uuid, 'd0000000-0000-4000-a000-000000000001'::uuid, 90, 30),
  ('d2000000-0000-4000-a000-000000000004'::uuid, 'd1000000-0000-4000-a000-000000000010'::uuid,
   'd0000000-0000-4000-a000-000000000009'::uuid, 'd0000000-0000-4000-a000-000000000008'::uuid, 70, 46)
) as c(id, listing_id, buyer_id, seller_id, age_hours, last_hours)
on conflict (id) do nothing;

insert into messages (id, conversation_id, sender_id, body, offer, created_at)
select m.id, m.conversation_id, m.sender_id, m.body, m.offer,
       now() - (m.age_hours || ' hours')::interval
from (values
  -- Poignée Hoyt : Léa (acheteuse) ↔ Camille (vendeuse)
  ('d3000000-0000-4000-a000-000000000001'::uuid, 'd2000000-0000-4000-a000-000000000001'::uuid,
   'd0000000-0000-4000-a000-000000000001'::uuid,
   'Bonjour Camille, la poignée est-elle toujours disponible ? Je cherche exactement ce modèle en 25 pouces.', null, 52),
  ('d3000000-0000-4000-a000-000000000002'::uuid, 'd2000000-0000-4000-a000-000000000001'::uuid,
   'd0000000-0000-4000-a000-000000000002'::uuid,
   'Bonjour ! Oui, toujours dispo. Elle est vraiment saine, je peux vous envoyer des photos du logement de branches si vous voulez.', null, 50),
  ('d3000000-0000-4000-a000-000000000003'::uuid, 'd2000000-0000-4000-a000-000000000001'::uuid,
   'd0000000-0000-4000-a000-000000000001'::uuid,
   'Volontiers. Et seriez-vous d''accord à ce prix, envoi compris ?', 390, 49),
  ('d3000000-0000-4000-a000-000000000004'::uuid, 'd2000000-0000-4000-a000-000000000001'::uuid,
   'd0000000-0000-4000-a000-000000000002'::uuid,
   'Je peux faire 400 € port compris, c''est mon dernier prix. Les photos arrivent ce soir.', null, 3),

  -- Mathews Lift : Léa (acheteuse) ↔ Thomas (vendeur)
  ('d3000000-0000-4000-a000-000000000005'::uuid, 'd2000000-0000-4000-a000-000000000002'::uuid,
   'd0000000-0000-4000-a000-000000000001'::uuid,
   'Bonsoir, l''arc est-il réglable pour une allonge de 28 pouces ? Et acceptez-vous une remise en main propre vers Montpellier ?', null, 26),
  ('d3000000-0000-4000-a000-000000000006'::uuid, 'd2000000-0000-4000-a000-000000000002'::uuid,
   'd0000000-0000-4000-a000-000000000003'::uuid,
   'Bonsoir, oui, il descend à 27,5 sans changer de module. Pour la main propre je passe à Montpellier début septembre, ça peut se faire.', null, 19),

  -- Housse Avalon : Thomas (acheteur) ↔ Léa (vendeuse)
  ('d3000000-0000-4000-a000-000000000007'::uuid, 'd2000000-0000-4000-a000-000000000003'::uuid,
   'd0000000-0000-4000-a000-000000000003'::uuid,
   'Bonjour, la housse passe-t-elle avec des branches de 70 pouces démontées ?', null, 90),
  ('d3000000-0000-4000-a000-000000000008'::uuid, 'd2000000-0000-4000-a000-000000000003'::uuid,
   'd0000000-0000-4000-a000-000000000001'::uuid,
   'Bonjour, oui sans problème, c''est ce que j''y mettais. Je vous la réserve le temps que vous décidiez.', null, 88),
  ('d3000000-0000-4000-a000-000000000009'::uuid, 'd2000000-0000-4000-a000-000000000003'::uuid,
   'd0000000-0000-4000-a000-000000000003'::uuid,
   'Parfait, je la prends. Je vous envoie mon adresse en message privé.', null, 30),

  -- Longbow Bear : Pierre (acheteur) ↔ Marine (vendeuse)
  ('d3000000-0000-4000-a000-000000000010'::uuid, 'd2000000-0000-4000-a000-000000000004'::uuid,
   'd0000000-0000-4000-a000-000000000009'::uuid,
   'Bonjour Marine, quel est l''âge de la corde et le bois a-t-il déjà été refait ?', null, 70),
  ('d3000000-0000-4000-a000-000000000011'::uuid, 'd2000000-0000-4000-a000-000000000004'::uuid,
   'd0000000-0000-4000-a000-000000000008'::uuid,
   'Bonjour, corde changée l''hiver dernier, jamais de reprise sur le bois. Il n''a que des marques de manipulation.', null, 46)
) as m(id, conversation_id, sender_id, body, offer, age_hours)
on conflict (id) do nothing;

-- Le trigger touch_conversation date chaque conversation de l'insertion des
-- messages : sans cela, les trois fils afficheraient « il y a 8 min ».
update conversations as c set updated_at = last_message.at
from (
  select conversation_id, max(created_at) as at from messages group by conversation_id
) as last_message
where c.id = last_message.conversation_id
  and c.id::text like 'd2000000-0000-4000-a000-%';

-- La conversation d2…03 a été lue par sa vendeuse jusqu'au dernier message ;
-- les autres restent non lues, pour que la pastille de messages soit visible.
insert into conversation_reads (conversation_id, user_id, read_at)
values (
  'd2000000-0000-4000-a000-000000000003',
  'd0000000-0000-4000-a000-000000000001',
  now() - interval '29 hours'
)
on conflict (conversation_id, user_id) do update set read_at = excluded.read_at;

commit;
