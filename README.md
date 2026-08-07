# Archers Market

Application mobile de petites annonces dédiée au tir à l'arc — « le marché d'occasion entre archers ».
Recréation en **Expo / React Native / TypeScript**, aux couleurs de la marque (orange `#F5843C`, anthracite `#1B1B1D`).

## Démarrer

```bash
npm install
npm start          # puis scanner le QR code avec Expo Go
npm run android    # ou ios / web
npm run typecheck  # vérification TypeScript
```

Les données viennent d'un projet Supabase : voir « Base de données » plus bas pour l'initialiser.

## Fonctionnalités

**Marketplace**
- Fil d'annonces avec recherche plein texte, tri (récence, prix, popularité) et 12 catégories métier
  (arc classique, poulies, traditionnel, flèches, viseurs, stabilisation, décocheurs, carquois,
  protections, cordes, cibles, textile).
- Filtres spécifiques à l'archerie : état, marque, **main d'arc**, fourchette de prix,
  **puissance en livres**, envoi possible.
- Fiche annonce : galerie, caractéristiques techniques (puissance, longueur, allonge, spine, taille),
  frais de port, vues, vendeur et annonces similaires.
- Dépôt d'annonce en un écran, avec photos depuis la galerie (visuel de catégorie par défaut),
  champs techniques adaptés à la catégorie choisie.
- Gestion de ses annonces : réservée / vendue / remise en ligne / suppression.

**Compte & favoris**
- Inscription, connexion, session persistante.
- Profil vendeur public (note, club, discipline, annonces en ligne) et compte personnel avec statistiques.
- Favoris liés au compte, accessibles depuis l'onglet dédié.

**Messagerie**
- Conversation par annonce entre acheteur et vendeur, badge de non-lus.
- Offres de prix attachées à un message.

## Publication

Cette version 2 remplace l'app publiée (un site embarqué en WebView). Elle reprend donc les
fiches stores existantes :

| | Identifiant | Statut |
| --- | --- | --- |
| iOS | `app.archersmarket.ios` (Apple ID `6448762227`) | confirmé |
| Android | `app.archersmarket.android` | **à confirmer** dans la Play Console |

L'ancienne version publiée est la 1.1.3 ; `app.json` est donc en 2.0.0.

## Base de données (Supabase)

Les clés client vivent dans `.env` (`EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_KEY`) ;
elles sont publiques par conception — c'est la sécurité au niveau ligne (RLS) qui protège les
données, jamais la clé. La clé secrète ne doit jamais entrer dans ce dépôt.

Pour initialiser un projet neuf, appliquer `supabase/migrations/0001_init.sql` :
soit `supabase db push`, soit un copier-coller dans l'éditeur SQL du tableau de bord. Le script crée :

- les tables `profiles`, `listings`, `listing_images`, `favorites`, `conversations`,
  `messages`, `conversation_reads` ;
- les politiques RLS (chacun ne modifie que ses annonces, une conversation n'est lisible que
  par ses deux participants, les favoris sont privés) ;
- le bucket Storage `listing-photos` et ses règles d'écriture par vendeur ;
- la création automatique du profil à l'inscription et la publication temps réel de la messagerie.

## Architecture

```
app/                    routes expo-router
  (tabs)/               Rechercher · Favoris · Publier · Messages · Compte
  listing/[id].tsx      fiche annonce
  chat/[id].tsx         conversation
  seller/[id].tsx       profil vendeur public
  login.tsx register.tsx
src/
  components/           Logo, ListingCard, ListingGrid, FiltersSheet, Button, Chip, Field…
  data/                 catalogue métier (catégories, marques, états)
  services/             accès aux données Supabase (auth, listings, photos, messages, favorites)
  store/                contextes React (Auth, Listings, Messages)
  theme/                design tokens de la charte
  utils/                formatage, résolution des visuels
assets/                 icônes, splash, visuels de catégorie
```

### Données

Les écrans ne parlent jamais à Supabase directement : tout passe par `src/services/*`, qui
convertit les lignes de la base (snake_case) vers le modèle de l'app (`src/types`). Changer de
backend revient donc à réimplémenter ces fichiers, sans toucher à l'interface.

Le fil d'annonces est chargé en une fois (500 max) puis filtré et trié côté client, ce qui rend
les filtres instantanés ; à fort volume, ces critères devront passer dans la requête SQL.

### Identité visuelle

`assets/icon.png` est le logo officiel et sert de source unique. Toutes les déclinaisons en sont
dérivées par le script `scripts/derive-brand-assets.js` :

- `assets/brand/emblem-dark.png` — emblème détouré, métal blanc (fonds sombres) ;
- `assets/brand/emblem-light.png` — métal gris (fonds clairs), utilisé par `LogoMark` dans l'app ;
- `assets/splash-icon.png`, `assets/android-icon-foreground.png`,
  `assets/android-icon-monochrome.png`, `assets/android-icon-background.png`, `assets/favicon.png`.

Après avoir remplacé `assets/icon.png`, relancer `node scripts/derive-brand-assets.js` pour
regénérer l'ensemble.
