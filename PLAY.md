# La fiche Google Play, champ par champ

Tout ce que la console réclame avant de pouvoir publier, avec la réponse à
donner et la raison de cette réponse. Les textes prêts à coller sont dans
`store/play/`.

La compilation et la signature sont ailleurs : voir `BUILD.md`.

---

## 1. Fiche du magasin

### Les textes

| Champ | Limite | À coller |
| --- | --- | --- |
| Nom de l'application | 30 | `Archers Market` (14) |
| Description courte | 80 | `Le marché d’occasion entre archers : paiement protégé, envoi accompagné.` (72) |
| Description complète | 4 000 | `store/play/description.txt` (2 771) |

La description courte est celle qui s'affiche sous l'icône dans les résultats
de recherche. Elle dit ce qu'on vend et ce qui nous distingue, dans cet ordre —
c'est souvent la seule ligne que quelqu'un lira.

Deux choses à ne pas y mettre, parce que Google les refuse : les emoji et les
majuscules d'insistance dans le nom ou la description courte, et toute
mention de classement (« n° 1 », « la meilleure ») ou de promotion tarifaire.

### Catégorie et coordonnées

| Champ | Valeur |
| --- | --- |
| Type d'application | Application |
| Catégorie | Achats |
| Tags | tir à l'arc, occasion, petites annonces, sport, matériel |
| E-mail | contact@archersmarket.fr |
| Site Web | https://archersmarket.fr |
| Politique de confidentialité | https://archersmarket.fr/confidentialite.html |

### Les images

Deux sont produites et prêtes, dans `store/play/` :

| Fichier | Format exigé | Ce que c'est |
| --- | --- | --- |
| `icone-512.png` | PNG 32 bits avec alpha, 512 × 512, ≤ 1 Mo | l'icône de la fiche |
| `presentation-1024x500.png` | PNG 24 bits sans alpha, 1024 × 500 | la bannière en haut de la fiche |

La bannière reprend l'emblème sur fond anthracite, avec le nom et la
signature. Ses éléments sont tenus à cent vingt pixels des bords : Google
recadre cette image selon les écrans, et ce qui touche le bord finit coupé.

### Les captures d'écran — attention au format

Minimum deux, huit au maximum. **Vos captures d'iPhone seront refusées
telles quelles.** Google impose que le grand côté ne dépasse pas le double du
petit ; une capture d'iPhone 6,7 pouces fait 1290 × 2796, soit un rapport de
2,17. Il faut donc les remettre au format 9:16.

Ce script les convertit toutes en 1080 × 1920, avec des bandes anthracite sur
les côtés. Il n'utilise que `sips`, livré avec macOS — rien à installer.

```bash
mkdir -p ~/Desktop/play-captures
cd ~/Downloads
for f in *.png *.PNG; do
  [ -e "$f" ] || continue
  sips -Z 1920 "$f" --out /tmp/redim.png >/dev/null
  sips -p 1920 1080 --padColor 1B1B1D /tmp/redim.png \
       --out ~/Desktop/play-captures/"${f%.*}.png" >/dev/null
  echo "$f"
done
```

Vérifiez ensuite que tout est bien à 1080 × 1920 :

```bash
sips -g pixelWidth -g pixelHeight ~/Desktop/play-captures/*.png | grep pixel
```

**Les tablettes, en revanche, demandent une décision.** Le `supportsTablet:
false` qui écarte l'iPad est un réglage iOS, sans équivalent Android : une
application Play s'installe sur tablette par défaut. Deux options.

Ne rien fournir est acceptable : les captures tablette sont facultatives.
Google affiche alors sur la fiche un avertissement « cette application n'est
pas optimisée pour votre appareil » aux possesseurs de tablette, et laisse
installer.

L'écarter franchement se fait dans *Version → Catalogue d'appareils → Règles
d'exclusion d'appareils*, en excluant les tablettes. C'est le pendant Android
de ce qu'on a fait sur iPad, et c'est ce que je recommande : l'application
est dessinée pour une colonne, et une fiche sans avertissement inspire plus
confiance qu'une fiche qui prévient d'un défaut.

---

## 2. Sécurité des données

C'est le formulaire bloquant, et le seul où une réponse fausse se paie cher :
Google recoupe les déclarations avec ce que fait réellement l'application, et
une divergence suspend la fiche.

Les réponses ci-dessous sont tirées de la politique de confidentialité
(`docs/confidentialite.html`), qui a été écrite à partir du code.

### Les questions d'ouverture

| Question | Réponse |
| --- | --- |
| Votre application collecte-t-elle des données utilisateur ? | **Oui** |
| Les données sont-elles chiffrées en transit ? | **Oui** — tout passe en HTTPS |
| Les utilisateurs peuvent-ils demander la suppression de leurs données ? | **Oui** |
| URL de suppression | https://archersmarket.fr/suppression-compte.html |
| Engagement envers la politique Familles | **Non** |
| Examen de sécurité indépendant | **Non** |

### Les types de données

Aucune n'est *partagée* au sens de Google. Supabase, Stripe, Boxtal, Resend,
Expo et Anthropic sont des **sous-traitants** — ils traitent pour notre compte
et sur nos instructions, ce que Google exclut explicitement du partage. La
déclaration fiscale à la DGFiP relève de l'obligation légale, également
exclue.

| Donnée | Catégorie Google | Obligatoire ? | Finalité |
| --- | --- | --- | --- |
| Nom affiché, pseudo | Informations personnelles → Nom | Oui | Fonctionnalité, gestion du compte |
| Adresse e-mail | Informations personnelles → Adresse e-mail | Oui | Fonctionnalité, gestion du compte |
| Identifiant de compte | Informations personnelles → ID utilisateur | Oui | Fonctionnalité, gestion du compte |
| Adresse d'expédition et de livraison | Informations personnelles → Adresse | Non — seulement si vous expédiez ou achetez | Fonctionnalité |
| Ville, club, discipline, présentation | Position → Position approximative | Non — la ville seule est demandée | Fonctionnalité |
| Commandes : montants, dates, suivi, référence de paiement | Informations financières → Historique des achats | Oui pour qui achète ou vend | Fonctionnalité |
| Messages, offres de prix | Messages → Autres messages in-app | Non | Fonctionnalité |
| Photos d'annonces | Photos et vidéos → Photos | Non | Fonctionnalité |
| Annonces, avis, signalements | Activité dans l'application → Autre contenu généré par l'utilisateur | Non | Fonctionnalité |
| Jeton de notification | ID de l'appareil ou autres ID | Non — sur consentement | Fonctionnalité |

Pour chacune : **collectée**, *pas* partagée, *pas* traitée de façon éphémère.

### Ce qu'il ne faut surtout pas déclarer

**Les informations de paiement.** Le numéro de carte de l'acheteur et l'IBAN
du vendeur sont saisis dans des formulaires fournis par Stripe et vont
directement chez lui. Google prévoit exactement ce cas : la déclaration n'est
pas requise si « votre application n'accède jamais à ces informations » et que
« le service de paiement les collecte directement auprès de l'utilisateur ».
Les deux conditions sont remplies. On ne conserve que des références de
paiement, qui ne permettent aucun prélèvement — et celles-là sont couvertes
par l'historique des achats.

**Les données fiscales des gros vendeurs** (adresse, date et lieu de
naissance, numéro fiscal, collectés au-delà de 30 ventes ou 2 000 € par an).
Google n'a pas de catégorie pour ça et l'obligation légale est explicitement
hors périmètre du formulaire. La politique de confidentialité les documente,
c'est là que ça se joue.

**Un identifiant publicitaire.** Il n'y en a aucun. C'est aussi la réponse à
la déclaration « votre application contient-elle des annonces ? » : non.

### Le piège de la position

Le premier réflexe est de répondre « aucune position collectée », puisque
l'application ne demande jamais le GPS. C'est faux au sens de Google, qui
définit la position approximative comme « une zone supérieure ou égale à
3 km², par exemple la ville où se trouve l'utilisateur ». La ville saisie au
profil et affichée publiquement sur chaque annonce entre dans cette
définition. Il faut donc la déclarer.

---

## 3. Classification du contenu

Le questionnaire IARC. Il s'adapte aux réponses, donc l'ordre exact des
questions peut varier ; ce qui suit sont celles qui comptent.

| Question | Réponse |
| --- | --- |
| Catégorie | Réseaux sociaux, forums, blogs et échange de contenus généré par les utilisateurs |
| Violence, sexualité, langage grossier, drogues, jeux d'argent | Non à tout |
| Les utilisateurs peuvent-ils interagir ou communiquer entre eux ? | **Oui** |
| L'application permet-elle de partager du contenu généré par les utilisateurs ? | **Oui** |
| L'application permet-elle de partager la position de l'utilisateur avec d'autres ? | **Oui** — la ville figure sur chaque annonce |
| L'application permet-elle d'acheter des biens numériques ? | **Non** — uniquement des objets physiques d'occasion |
| L'application contient-elle des achats intégrés ? | **Non** au sens de Google Play Billing |

Sur les deux derniers points : la facturation Google Play n'est obligatoire
que pour les biens et services **numériques**. Une place de marché de
matériel physique en est dispensée, exactement comme sur l'App Store. Le
paiement passe par Stripe, et c'est conforme.

**Sur le matériel de tir à l'arc.** J'ai vérifié la politique « produits
dangereux » : elle vise « la vente d'explosifs, d'armes à feu, de munitions ou
de certains accessoires d'armes à feu ». Ni l'arc ni la flèche n'y figurent,
et aucune mention n'est faite des articles de sport. Le risque existe mais il
est faible, et la description insiste sur la nature sportive du matériel.

Attendez-vous à ressortir en **PEGI 12** ou **PEGI 16** : ce n'est pas le
contenu qui le décide, mais l'interaction entre utilisateurs et le partage de
position.

---

## 4. Public cible et contenu

| Champ | Réponse |
| --- | --- |
| Tranches d'âge visées | **18 ans et plus**, uniquement |
| L'application attire-t-elle les enfants ? | **Non** |

Répondre 18+ sort entièrement du périmètre de la politique Familles, et c'est
cohérent : acheter engage un contrat et un paiement.

---

## 5. Accès à l'application

Google exige un compte de test si des écrans sont derrière une connexion — et
ici, presque tout l'est. Sans ça, l'examinateur voit une page de connexion et
refuse.

Répondre : **« Toutes les fonctionnalités sont accessibles avec les
identifiants fournis »**, puis donner le compte de revue déjà créé pour Apple.

Instructions à recopier dans le champ prévu :

```
Connexion par e-mail et mot de passe depuis l'écran d'accueil.
Les boutons « Continuer avec Apple » et « Continuer avec Google »
ne sont pas nécessaires.

Le compte fourni est un compte acheteur : il permet de parcourir les
annonces, d'ouvrir une conversation, de déposer une annonce et de
lancer une commande jusqu'à l'écran de paiement.

Ne pas valider le paiement : les clés Stripe sont en production et
la carte serait réellement débitée.
```

**Changez le mot de passe de ce compte avant de le donner à Google.** Celui
utilisé jusqu'ici a circulé en clair dans nos échanges, ce qui est acceptable
pour une phase de test mais pas pour un identifiant qui va vivre dans un
formulaire.

---

## 6. Les déclarations qui restent

| Déclaration | Réponse | Pourquoi |
| --- | --- | --- |
| Annonces publicitaires | **Non** | aucune régie, aucun identifiant publicitaire |
| Application d'actualités | Non | |
| Application COVID-19 | Non | |
| Application publique ou gouvernementale | Non | |
| Facturation Google Play | Non applicable | biens physiques uniquement |
| Fonctionnalités financières | **Non** — à confirmer | voir ci-dessous |

**Le seul point qui mérite réflexion, c'est la déclaration financière.**
Google la réserve à des activités nommées : crédit à la consommation, banque
en ligne, cryptomonnaies, investissement, assurance, gestion de dette,
transfert d'argent. La séquestre d'Archers Market n'entre dans aucune : elle
est accessoire à la vente d'un objet, elle ne transfère pas d'argent entre
personnes en dehors d'un achat, et il n'y a ni crédit ni placement. Je réponds
donc non — mais lisez la liste que la console vous présentera, car Google la
fait évoluer, et sous-déclarer là-dessus coûte la suspension.

---

## 7. L'ordre dans lequel remplir

Le tableau de bord de la console liste les tâches en vrac. Cet ordre-ci évite
de refaire deux fois le même travail :

1. **Sécurité des données** — le plus long, et il conditionne la publication.
2. **Classification du contenu** — cinq minutes une fois le reste connu.
3. **Public cible**, puis les déclarations du point 6.
4. **Accès à l'application** — après avoir changé le mot de passe du compte.
5. **Fiche du magasin** — textes et images, tout est prêt.
6. **Test interne** : déposer le premier `.aab` à la main, l'installer sur un
   téléphone, vérifier que la connexion, une annonce et une conversation
   fonctionnent.
7. **Promotion en production**, et diffusion dans les pays voulus.

Sur ce dernier point : la fiche actuelle n'est diffusée que dans **4 pays sur
177**. C'est probablement un reste de l'ancienne configuration. La France
mise à part, il vaut la peine de regarder si la Belgique, la Suisse et le
Luxembourg y figurent — ce sont des archers francophones à qui l'application
parle sans traduction.
