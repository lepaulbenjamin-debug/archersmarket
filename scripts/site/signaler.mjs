#!/usr/bin/env node
/**
 * Signale aux moteurs les pages nouvelles ou modifiées, par IndexNow.
 *
 *   node scripts/site/signaler.mjs <fichier-json-des-adresses>
 *
 * IndexNow est un protocole par lequel un site annonce lui-même ce qui a
 * changé, au lieu d'attendre qu'un robot repasse. Bing le reconnaît — et Bing
 * alimente aussi la recherche des assistants (ChatGPT, Copilot) : une annonce
 * signalée ici peut y être citée le jour même. Les autres moteurs du protocole
 * (Yandex, Seznam, Naver…) reçoivent la même annonce par partage. Google ne
 * l'utilise pas : pour lui, c'est le sitemap déclaré dans la Search Console.
 *
 * La clé n'a rien de secret : c'est un fichier posé à la racine du site
 * (`docs/<clé>.txt`), que le moteur va lire pour vérifier que l'annonce vient
 * bien de qui contrôle le domaine. On l'envoie donc après la publication,
 * quand le fichier est en ligne.
 *
 * Un échec n'est jamais bloquant : le site est déjà publié, et les moteurs
 * finiront par passer. On le dit dans le journal, et on s'arrête là.
 */

import fs from 'node:fs';
import path from 'node:path';

const HOTE = 'archersmarket.fr';
const racine = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

const cles = fs.readdirSync(path.join(racine, 'docs')).filter((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (cles.length !== 1) {
  console.log(`IndexNow : ${cles.length} fichier(s) de clé dans docs/, un seul attendu. Rien n'est signalé.`);
  process.exit(0);
}
const cle = cles[0].replace(/\.txt$/, '');

const fichier = process.argv[2];
const adresses = fichier && fs.existsSync(fichier) ? JSON.parse(fs.readFileSync(fichier, 'utf8')) : [];
// Le protocole n'accepte que des adresses du domaine déclaré, 10 000 au plus.
const urlList = adresses.filter((u) => new URL(u).host === HOTE).slice(0, 10000);

if (urlList.length === 0) {
  console.log('IndexNow : rien de nouveau depuis la publication précédente.');
  process.exit(0);
}

try {
  const reponse = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOTE, key: cle, keyLocation: `https://${HOTE}/${cle}.txt`, urlList }),
  });
  // 200 : reçu. 202 : reçu, clé en cours de vérification — normal la première fois.
  const issue = reponse.ok ? 'reçu' : `refusé (${await reponse.text()})`;
  console.log(`IndexNow : ${urlList.length} adresse(s) signalée(s), réponse ${reponse.status} — ${issue}.`);
  for (const u of urlList) console.log(`  ${u}`);
} catch (erreur) {
  console.log(`IndexNow : envoi impossible (${erreur.message}). Les moteurs repasseront d'eux-mêmes.`);
}
