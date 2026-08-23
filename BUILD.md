# Compiler et envoyer une version iOS depuis le Mac

La chaîne Android est décrite dans la seconde moitié du fichier, à partir de
« Compiler et envoyer une version Android ».

Le forfait gratuit d'Expo plafonne le nombre de builds iOS mensuels. Une fois
ce plafond atteint, `eas build` refuse de partir jusqu'au mois suivant.

La compilation locale contourne cela : le build tourne **sur votre machine**,
et EAS n'est contacté que pour vérifier le projet et fournir les certificats.
On garde donc la même configuration, les mêmes certificats et la même clé de
soumission — seule la machine qui compile change.

## Ce qu'il faut sur le Mac

| | Vérifier avec | Si ça manque |
| --- | --- | --- |
| Xcode | `xcodebuild -version` | App Store, puis l'ouvrir une fois pour accepter la licence |
| Outils en ligne de commande | `xcode-select -p` | `xcode-select --install` |
| Node 20 ou plus | `node --version` | [nodejs.org](https://nodejs.org) ou `brew install node` |
| CocoaPods | `pod --version` | `brew install cocoapods` |
| Fastlane | `fastlane --version` | `brew install fastlane` |

Comptez une bonne dizaine de gigaoctets libres : Xcode et les dépendances
natives ne sont pas légers.

## La première fois

```bash
git clone https://github.com/lepaulbenjamin-debug/archersmarket.git
cd archersmarket
git checkout claude/archers-market-mobile-app-l43br9
npm install
```

Rien à configurer côté clés publiques : `.env` est versionné et porte les
trois clés client (Supabase et Stripe). Elles sont publiques par conception —
c'est la sécurité au niveau ligne, côté base, qui protège les données.

Deux choses ne sont pas dans le dépôt, et ne doivent pas y être :

**La clé de soumission Apple.** Déposez `AuthKey_TSS8TW85GV.p8` dans
`credentials/`. Le dossier est ignoré par git.

```bash
mkdir -p credentials
cp ~/Downloads/AuthKey_TSS8TW85GV.p8 credentials/
chmod 600 credentials/AuthKey_TSS8TW85GV.p8
```

**Le jeton Expo.** Il donne accès aux certificats de signature stockés chez
EAS. Soit vous vous connectez une fois :

```bash
npx eas-cli login
```

soit vous le passez à chaque commande :

```bash
export EXPO_TOKEN=…
```

## Compiler

```bash
npx eas-cli build --platform ios --profile production --local
```

Comptez vingt à quarante minutes la première fois — les dépendances natives
se compilent intégralement. Les suivantes sont plus rapides.

Le résultat est un fichier `build-<horodatage>.ipa` déposé dans le dossier
courant. Le numéro de build s'incrémente tout seul : il est tenu par EAS, pas
par le fichier `app.json`, ce qui évite deux builds portant le même numéro
selon la machine qui compile.

## Envoyer sur TestFlight

```bash
npx eas-cli submit --platform ios --profile production --path "$(ls -t build-*.ipa | head -1)"
```

Le fichier est nommé explicitement plutôt que par joker : dès qu'il reste un
`.ipa` d'une compilation précédente, `--path build-*.ipa` s'étend en deux
chemins, le second devient un argument orphelin et la commande s'arrête sur
« Unexpected argument ». `ls -t | head -1` prend simplement le plus récent.

Pensez à supprimer les anciens `.ipa` une fois envoyés : ils pèsent trente-cinq
mégaoctets pièce et ne servent plus à rien.

Apple traite le binaire pendant cinq à dix minutes, puis envoie un e-mail. La
version apparaît ensuite dans App Store Connect, onglet TestFlight.

## Quand ça coince

**« No development team found » ou une erreur de signature.** Le jeton Expo
n'est pas passé, donc EAS n'a pas pu fournir les certificats. Vérifiez
`npx eas-cli whoami`.

**« CocoaPods could not find compatible versions ».** Le cache local est
périmé :

```bash
cd ios && pod repo update && pod install && cd ..
```

**« Command PhaseScriptExecution failed ».** Presque toujours un dossier natif
généré à partir d'une version antérieure. On le régénère :

```bash
rm -rf ios
npx expo prebuild --platform ios --clean
```

**Le build passe mais l'envoi est refusé.** Le plus souvent, la clé `.p8`
manque ou son identifiant ne correspond plus à celui d'`eas.json`
(`ascApiKeyId`). Une clé App Store Connect ne se retélécharge jamais : si elle
est perdue, il faut en créer une autre dans App Store Connect → Utilisateurs
et accès → Intégrations, et mettre `eas.json` à jour. L'identifiant d'émetteur
(`ascApiKeyIssuerId`), lui, appartient à l'équipe et ne change pas.

## Après ce build : les corrections sans recompiler

Une fois cette version installée, tout changement qui ne touche que le
JavaScript — un écran, un libellé, une règle d'affichage — peut partir sans
recompiler ni repasser par Apple :

```bash
npx eas-cli update --branch production --message "ce qui change"
```

L'application récupère la mise à jour à son prochain démarrage. Cela ne
consomme aucun build.

Deux limites, et elles comptent.

**Une dépendance native oblige à recompiler.** Ajouter une bibliothèque avec
du code natif — une carte, un lecteur vidéo, un module de paiement — change la
couche native, qu'une mise à jour à distance ne peut pas remplacer.

C'est réglé par la politique `fingerprint` déclarée dans `app.json` : EAS
calcule une empreinte de la couche native, et une mise à jour n'atteint que
les installations dont l'empreinte correspond. Une version trop ancienne ne
reçoit simplement rien, au lieu de recevoir du JavaScript réclamant un module
absent et de planter au lancement.

**Apple tolère ces mises à jour, mais pas n'importe lesquelles.** Corriger,
ajuster, améliorer : oui. Changer ce que fait l'application ou contourner un
refus de revue : non. Une fonctionnalité substantielle passe par une nouvelle
version soumise.

## Ce qui reste chez EAS

Les certificats de distribution et le profil de provisionnement restent
hébergés par Expo, et sont téléchargés au début de chaque build. C'est
volontaire : les garder sur une seule machine, c'est les perdre le jour où
elle tombe en panne.

## Ce que la compilation locale ne fait pas

Le cache de build partagé, la compilation simultanée de plusieurs plateformes
(`--platform all`) et les variables d'environnement marquées « secret » chez
EAS ne fonctionnent qu'en compilation distante. Aucune de ces trois choses
n'est utilisée ici.

---

# Compiler et envoyer une version Android

La fiche Google Play existe déjà : c'est celle de l'ancienne application, un
simple habillage du site web. On ne crée donc rien — on publie une nouvelle
version sur la fiche en place, exactement comme côté Apple.

| | Valeur |
| --- | --- |
| Nom de paquet | `app.archersmarket.android` |
| Dernière version en production | code 17, nom 2.1.2, en ligne depuis le 11 juin 2024 |
| Identifiant développeur | 5816787209526814734 |
| Identifiant d'application | 4972516950188671612 |

Le nom de paquet correspond au champ `android.package` d'`app.json`. C'est la
condition qui rend la reprise possible : un nom de paquet ne se change jamais
après publication, et un `.aab` qui n'a pas le bon est refusé.

## Deux choses à régler avant de compiler

### Le numéro de version

Google n'accepte une mise à jour que si son `versionCode` est **strictement
supérieur** au plus élevé déjà envoyé. Le dernier est 17 : il faut donc au
moins 18.

Le `"versionCode": 2` qui traîne dans `app.json` n'est pas ce qui sera utilisé.
`eas.json` déclare `"appVersionSource": "remote"` : le compteur est tenu par
EAS, pas par le fichier, et il part de zéro pour une plateforme jamais
compilée. Il faut donc l'amorcer une fois :

```bash
npx eas-cli build:version:set --platform android
```

La commande demande la valeur : répondez **18**. Les builds suivants
s'incrémenteront seuls, `production` ayant `autoIncrement: true`.

Le **nom** de version vient d'`app.json`, et lui n'est pas géré par EAS. Il
est passé à « 2.2.0 » : la fiche Play affichait « 2.1.2 », et publier
« 2.0.0 » par-dessus aurait ressemblé à un retour en arrière pour qui regarde
le détail de la page. Google ne l'interdit pas — seul le `versionCode` doit
monter — mais autant que le numéro affiché raconte la bonne histoire.

Côté Apple, la version en revue reste « 2.0.0 » : son binaire est déjà
compilé, ce changement ne l'atteint pas. Le build 12 sortira en 2.2.0, et les
deux plateformes seront de nouveau alignées.

### La signature

Deux clés, et il faut les distinguer, parce que l'une se remplace et l'autre
non.

La **clé de signature d'application** est celle que les téléphones vérifient
pour accepter une mise à jour. Elle est irremplaçable : si elle est perdue,
la fiche l'est aussi. Ici la **signature d'application Play est activée** —
console Play, *Protégé avec Play → Protection Play Store → Protéger la clé de
signature d'application : « Versions signées par Play »*. Google la détient
donc, à l'abri, et il n'y a rien à faire de ce côté.

La **clé d'importation** ne sert qu'à prouver à Google que le `.aab` vient
bien de vous. Google la vérifie, la retire, et resigne avec la vraie clé. Elle
se remplace, et c'est justement là qu'il y a du travail.

Le certificat d'importation enregistré sur la fiche ne nous appartient pas :

```
subject = C=US, ST=Delaware, L=Middletown, O=AppMySite Inc, OU=IT, CN=IT Manager
SHA-1   = 00:4E:2E:DD:EB:0C:C4:87:12:D6:02:29:9E:1A:1D:ED:BD:11:67:28
SHA-256 = 4B:DC:C8:8E:62:AA:9C:76:80:91:2C:67:2F:FD:3A:14:3B:CB:5A:8F:22:2C:BD:D8:55:3E:8A:5D:CB:07:10:A6
émis le 19 avril 2023, valable jusqu'au 4 septembre 2050
```

**AppMySite** est le prestataire qui avait fabriqué l'ancienne application,
l'habillage du site web. La clé privée correspondante est chez eux, pas chez
nous. Aucun `.aab` compilé par EAS ne sera accepté tant que ce certificat
reste celui de la fiche.

Il faut donc demander une **réinitialisation de la clé d'importation**. C'est
gratuit, prévu par Google, et sans effet sur la fiche ni sur les
installations. Trois étapes.

**1. Fabriquer la nouvelle clé.**

```bash
mkdir -p credentials
keytool -genkeypair -v \
  -keystore credentials/archersmarket-upload.jks \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` demande deux mots de passe (celui du magasin et celui de la clé —
mettez le même) puis quelques champs d'identité : nom, organisation, pays. Ils
n'ont aucune importance technique, ils ne s'affichent nulle part.

**2. En extraire le certificat public**, au format que le formulaire attend :

```bash
keytool -export -rfc \
  -keystore credentials/archersmarket-upload.jks \
  -alias upload -file credentials/upload_certificate.pem
```

**3. Demander la réinitialisation.** Console Play, *Protégé avec Play →
Protection Play Store → Gérer la signature d'application Play*, section
**Certificat de clé d'importation**, bouton **Demander la réinitialisation de
la clé d'importation**. Déposez le `.pem`, indiquez le motif — « la clé
d'importation appartient à un ancien prestataire, l'application est
désormais développée en interne » — et validez. Google répond sous 24 à 48
heures.

Si le bouton affiche « Autorisation nécessaire », c'est que la session n'est
pas celle du **propriétaire du compte**. Cette demande n'est ouverte qu'à lui,
ou à un utilisateur explicitement autorisé à gérer la signature d'application.

**Puis confier la clé à EAS :**

```bash
npx eas-cli credentials --platform android
```

Profil `production` → *Keystore* → *Set up a new keystore* → choisir de
téléverser son propre fichier, et donner `credentials/archersmarket-upload.jks`
avec ses mots de passe.

Gardez le fichier et ses mots de passe, mais sans angoisse : la signature
d'application Play étant active, une clé d'importation perdue se
réinitialise à nouveau par la même procédure. C'est tout l'intérêt du
dispositif — le seul secret irremplaçable est chez Google.

## Compiler

Contrairement à iOS, rien n'oblige à compiler sur votre machine : les builds
Android sont nettement moins gourmands et le forfait gratuit les encaisse.

```bash
npx eas-cli build --platform android --profile production
```

**On peut compiler sans attendre la réponse de Google.** La demande de
réinitialisation met vingt-quatre à quarante-huit heures ; le `.aab`, lui, est
déjà signé avec la nouvelle clé. Compiler tout de suite a même un intérêt :
c'est la première compilation Android du projet, et s'il doit y avoir une
surprise Gradle, autant la découvrir pendant l'attente plutôt qu'après.

Ce qu'il ne faut pas faire, c'est téléverser avant l'accord. Google refuserait
le fichier — « votre App Bundle est signé avec la mauvaise clé » — puisque le
certificat enregistré serait encore celui d'AppMySite.

Le profil `production` produit un **App Bundle** (`.aab`), le seul format que
Google Play accepte aujourd'hui. EAS fournit un lien de téléchargement à la
fin.

Pour compiler localement, il faut un JDK 17 et le SDK Android (Android Studio
les installe tous les deux) :

```bash
npx eas-cli build --platform android --profile production --local
```

## Envoyer sur Google Play

**Le tout premier envoi se fait à la main.** `eas submit` s'appuie sur l'API
Google Play, qui refuse de servir une application dont aucune version n'a
encore été déposée par ce compte de service. Console Play → **Tests → Test
interne** → *Créer une version* → déposez le `.aab`.

Une fois cette première version passée, l'envoi s'automatise. Il faut un
compte de service Google :

1. Console Play → **Configuration → Accès à l'API** → *Créer un compte de
   service*, ce qui bascule sur la console Google Cloud.
2. Créez-y le compte, puis une clé au format **JSON**, et téléchargez-la.
3. De retour dans la console Play, accordez-lui les droits *Version* sur
   l'application.
4. Déposez le fichier dans `credentials/` — le dossier est ignoré par git — et
   ajoutez son chemin sous `submit.production.android` dans `eas.json` :
   `"serviceAccountKeyPath": "./credentials/play-service-account.json"`.

```bash
npx eas-cli submit --platform android --profile production
```

Le profil vise la piste `internal`. On promeut ensuite vers la production
depuis la console, une fois la version essayée sur un téléphone.

## Ce qui ne marchera pas encore sur Android

**Les notifications.** Elles passent par Firebase Cloud Messaging, et le
projet n'a ni `google-services.json` ni projet Firebase. L'application ne
plante pas pour autant : `registerForPush` intercepte l'échec et affiche
« Impossible d'activer les notifications pour l'instant. » Pour les activer,
il faudra créer un projet Firebase sur le nom de paquet, déposer le
`google-services.json`, le déclarer dans `app.json`
(`android.googleServicesFile`), téléverser la clé FCM V1 chez Expo, et
recompiler.

**La carte des points relais.** Elle demande une clé Google Maps Android, que
le projet n'a pas non plus. Là encore c'est prévu : sans clé, la liste des
points relais s'affiche seule, sans le rectangle gris d'une carte qui ne
charge pas.

Aucune des deux ne bloque la publication.

## Les permissions annoncées sur la fiche

Google Play affiche la liste des permissions du manifeste sur la page de
l'application. Trois y figuraient sans que rien ne les justifie :

| Permission | D'où elle venait | Pourquoi elle est retirée |
| --- | --- | --- |
| `CAMERA` | manifeste d'`expo-image-picker` | l'application n'ouvre jamais l'appareil photo, seulement la galerie |
| `RECORD_AUDIO` | greffon d'`expo-image-picker`, pour la vidéo | aucune vidéo, aucun son |
| `SYSTEM_ALERT_WINDOW` | gabarit Expo, commenté « retirez ce dont vous n'avez pas besoin » | l'application ne dessine rien par-dessus les autres |

Une place de marché qui réclame le micro et la caméra pour vendre des arcs
d'occasion, c'est le genre de détail qui fait reculer un acheteur au moment
d'installer. Les deux premières sont bloquées par `cameraPermission: false` et
`microphonePermission: false` sur le greffon `expo-image-picker`, la troisième
par `android.blockedPermissions`. Le manifeste les marque `tools:node="remove"`,
ce qui les retire de la fusion finale.

Restent `INTERNET`, `VIBRATE` (les notifications) et le couple
`READ`/`WRITE_EXTERNAL_STORAGE` plafonné à Android 12, dont le sélecteur de
photos a besoin sur les appareils anciens.

## Les empreintes natives, et pourquoi elles comptent ici

Ce nettoyage des permissions touche `app.json`, donc l'empreinte, donc le
`runtimeVersion`. Conséquence concrète : la version iOS **build 11**, celle
soumise à la revue Apple, ne recevra plus les mises à jour à distance
publiées depuis la branche.

Ce n'est pas une impasse, mais il faut le savoir. Ce qui compte à retenir
n'est pas une empreinte — on ne les recopie pas à la main, et une mesure faite
sur une autre machine peut différer — mais **le commit d'où chaque version est
partie** :

| Version | Commit d'origine |
| --- | --- |
| iOS build 11, en ligne sur l'App Store | `55cf9a8` |
| iOS build 12 et suivants, première version Android | après le nettoyage des permissions |

Pour corriger quelque chose sur le build 11 sans repasser par Apple, il faut
publier depuis ce commit-là :

```bash
git checkout -b correctif-build11 55cf9a8
# on y reporte la correction, puis :
npx eas-cli update --branch production --platform ios --message "…"
```

`eas update` affiche l'empreinte retenue et le nombre d'installations
concernées. C'est la seule mesure qui fait foi : si elle ne correspond pas à
celle du build visé, la mise à jour n'atteindra personne, et la commande le
dit avant de publier.

Cette gymnastique disparaît dès qu'un build 12 est en ligne : les deux
plateformes repartent alors de la même empreinte que la branche.
