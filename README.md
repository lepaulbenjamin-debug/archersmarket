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

Compte de démonstration pré-rempli sur l'écran de connexion :
`camille@archersmarket.fr` / `demo1234`.

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

## Base de données

`supabase/migrations/0001_init.sql` contient le schéma cible : profils, annonces et leurs photos,
favoris, conversations et messages, avec la sécurité au niveau ligne (RLS) et le bucket Storage
des photos. Il s'applique tel quel sur un projet Supabase neuf
(`supabase db push`, ou copier-coller dans l'éditeur SQL).

Tant qu'aucun backend n'est configuré, l'app fonctionne sur son jeu de démonstration local
(voir ci-dessous).

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
  data/                 catalogue métier (catégories, marques, états) et jeu de démonstration
  services/             couche d'accès aux données (auth, listings, messages, favorites)
  store/                contextes React (Auth, Listings, Messages)
  theme/                design tokens de la charte
  utils/                formatage, résolution des visuels
assets/                 icônes, splash, visuels de catégorie
```

### Données

Tout passe par `src/services/*`, adossé à un stockage local (AsyncStorage) alimenté par un jeu de
démonstration au premier lancement. Les écrans ne connaissent que ces services : brancher un vrai
backend (Supabase, API REST…) revient à réimplémenter `src/services/` sans toucher à l'interface.

### Identité visuelle

`assets/icon.png` est le logo officiel et sert de source unique. Toutes les déclinaisons en sont
dérivées par le script `scripts/derive-brand-assets.js` :

- `assets/brand/emblem-dark.png` — emblème détouré, métal blanc (fonds sombres) ;
- `assets/brand/emblem-light.png` — métal gris (fonds clairs), utilisé par `LogoMark` dans l'app ;
- `assets/splash-icon.png`, `assets/android-icon-foreground.png`,
  `assets/android-icon-monochrome.png`, `assets/android-icon-background.png`, `assets/favicon.png`.

Après avoir remplacé `assets/icon.png`, relancer `node scripts/derive-brand-assets.js` pour
regénérer l'ensemble.
