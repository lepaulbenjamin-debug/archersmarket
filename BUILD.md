# Compiler et envoyer une version iOS depuis le Mac

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
npx eas-cli submit --platform ios --profile production --path build-*.ipa
```

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
