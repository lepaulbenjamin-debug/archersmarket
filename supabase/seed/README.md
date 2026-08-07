# Jeu de démonstration

`demo.sql` peuple la base d'un marché crédible : neuf membres, trente-sept
annonces couvrant les douze catégories, ventes conclues, avis, favoris et
conversations. Il sert aux captures d'écran de la fiche App Store, à la recette
sur TestFlight et à la revue Apple.

## Poser le jeu

Console Supabase → SQL Editor → coller `demo.sql` → exécuter. Le script est
idempotent : le relancer après une modification met le jeu à jour sans doublon.

## Le retirer

Même chose avec `demo_clean.sql`. Il n'efface que les lignes de démonstration,
reconnaissables à leur identifiant (`d0…` membres, `d1…` annonces, `d2…`
conversations, `d3…` messages, `d4…` avis). Les comptes réels ont des
identifiants tirés au hasard et ne sont pas touchés.

## Le compte laissé à la revue Apple

    demo@archersmarket.fr
    ArchersDemo2026!

C'est le seul compte connectable. Il a deux annonces en ligne, une réservée,
une vendue, six favoris, trois conversations (acheteuse dans deux d'entre
elles, vendeuse dans la troisième), trois avis reçus et un avis à déposer.

Les huit autres membres reçoivent un mot de passe aléatoire à la création : ils
animent le marché sans pouvoir être empruntés.

## Photos

Les annonces n'ont pas de photo : l'app retombe sur le visuel de catégorie.
C'est volontaire — reprendre des photos de matériel trouvées en ligne poserait
un problème de droits, dans une base qui sert la version publiée. Avant les
captures de la fiche App Store, remplacez au moins les annonces mises en avant
par de vraies photos.
