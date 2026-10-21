#!/usr/bin/env node
/**
 * Assemble le site archersmarket.fr.
 *
 *   node scripts/site/construire.mjs <export-web> <docs> <sortie>
 *
 * Trois sources, un seul site :
 *
 * - l'application web, produite par `npx expo export --platform web` : c'est
 *   elle qui répond à l'accueil et à tous les écrans du marché ;
 * - les pages écrites à la main de `docs/` : guides, aide, conditions,
 *   mentions légales — servies telles quelles, à leurs adresses de toujours ;
 * - une page par annonce publiée, générée ici à partir de la base.
 *
 * Pourquoi générer ces pages, alors que l'application sait afficher une
 * annonce ? Parce qu'un moteur de recherche qui demande
 * `/listing/<id>` recevrait sinon une page vide qu'il faut exécuter pour voir
 * quoi que ce soit, avec un titre générique. Ici, chaque fiche arrive avec son
 * titre, son prix, sa photo, ses données structurées et un résumé lisible dans
 * le HTML même. Au démarrage, l'application remplace ce résumé par la vraie
 * fiche : le visiteur ne voit aucune différence, le robot lit tout.
 *
 * Le script n'a besoin d'aucun secret : il lit la base avec la clé publique,
 * comme un visiteur non connecté, et ne voit donc que ce que tout le monde
 * voit déjà.
 */

import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://archersmarket.fr';
const [exportWeb, docs, sortie] = process.argv.slice(2);
if (!exportWeb || !docs || !sortie) {
  console.error('usage : node scripts/site/construire.mjs <export-web> <docs> <sortie>');
  process.exit(2);
}
const racineProjet = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

// ---------------------------------------------------------------------------
// Configuration publique
// ---------------------------------------------------------------------------

/** Les clés de `.env` : publiques par conception, versionnées avec le code. */
function lireEnv() {
  const valeurs = { ...process.env };
  const fichier = path.join(racineProjet, '.env');
  if (fs.existsSync(fichier)) {
    for (const ligne of fs.readFileSync(fichier, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(ligne.trim());
      if (m && valeurs[m[1]] === undefined) valeurs[m[1]] = m[2];
    }
  }
  return valeurs;
}
const env = lireEnv();
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.EXPO_PUBLIC_SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Clés Supabase publiques introuvables dans .env.');
if (/service_role|sb_secret_/.test(SUPABASE_KEY)) {
  // Ce script publie ce qu'il lit. Avec une clé privilégiée, il lirait — et
  // publierait — ce qui est caché aux visiteurs. On refuse de partir.
  throw new Error('Clé privilégiée détectée : ce script ne doit lire la base qu’en anonyme.');
}

// ---------------------------------------------------------------------------
// Libellés : repris du catalogue de l'application, jamais recopiés
// ---------------------------------------------------------------------------

function libellesDe(nomTableau, attendus) {
  const source = fs.readFileSync(path.join(racineProjet, 'src/data/catalog.ts'), 'utf8');
  const debut = source.indexOf(`export const ${nomTableau}`);
  const fin = source.indexOf('];', debut);
  const bloc = source.slice(debut, fin);
  const libelles = {};
  for (const m of bloc.matchAll(/id: '([^']+)',\s*label: '((?:[^'\\]|\\.)*)'/g)) {
    libelles[m[1]] = m[2].replace(/\\'/g, "'");
  }
  // Un catalogue mal lu donnerait des pages avec « undefined » en titre de
  // rubrique. Mieux vaut que la construction échoue, et bruyamment.
  if (Object.keys(libelles).length < attendus) {
    throw new Error(`Catalogue : ${nomTableau} lu à ${Object.keys(libelles).length} entrées, ${attendus} attendues.`);
  }
  return libelles;
}
const CATEGORIES = libellesDe('categories', 17);
const ETATS = libellesDe('conditions', 5);
const MAINS = libellesDe('handednessOptions', 3);

// ---------------------------------------------------------------------------
// Échappement : tout ce qui vient d'une annonce a été saisi par un membre
// ---------------------------------------------------------------------------

const html = (texte) =>
  String(texte ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Du JSON qu'on peut poser dans une balise <script> sans qu'un titre
 * contenant « </script> » n'en sorte pour injecter du code dans la page.
 */
const jsonLd = (objet) =>
  JSON.stringify(objet).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const resume = (texte, longueur) => {
  const plat = String(texte ?? '').replace(/\s+/g, ' ').trim();
  if (plat.length <= longueur) return plat;
  return plat.slice(0, plat.lastIndexOf(' ', longueur - 1)).replace(/[,;:.\s]+$/, '') + '…';
};

const prix = (montant) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(montant);

const photo = (chemin) => `${SUPABASE_URL}/storage/v1/object/public/listing-photos/${chemin}`;

// ---------------------------------------------------------------------------
// Les annonces
// ---------------------------------------------------------------------------

async function lireAnnonces() {
  const champs = [
    'id', 'title', 'description', 'price', 'category', 'brand', 'condition', 'hand', 'city',
    'status', 'created_at', 'updated_at', 'draw_weight', 'bow_length', 'draw_length', 'spine',
    'size', 'shipping', 'listing_images(path,position)',
  ].join(',');
  const annonces = [];
  // Les réservées restent visibles : elles peuvent encore se libérer. Les
  // vendues sortent de l'index, comme elles sortent du fil.
  for (let depart = 0; ; depart += 1000) {
    const reponse = await fetch(
      `${SUPABASE_URL}/rest/v1/listings?select=${champs}&status=in.(active,reserved)&order=created_at.desc`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Range: `${depart}-${depart + 999}`,
        },
      },
    );
    if (!reponse.ok) throw new Error(`Lecture des annonces : ${reponse.status} ${await reponse.text()}`);
    const lot = await reponse.json();
    annonces.push(...lot);
    if (lot.length < 1000) break;
  }
  for (const a of annonces) {
    a.photos = (a.listing_images ?? []).sort((x, y) => x.position - y.position).map((i) => photo(i.path));
  }
  return annonces;
}

/** Les caractéristiques d'une annonce, telles que la fiche les affiche. */
function caracteristiques(a) {
  const lignes = [
    ['Catégorie', CATEGORIES[a.category]],
    ['Marque', a.brand],
    ['État', ETATS[a.condition]],
    ['Main d’arc', MAINS[a.hand]],
  ];
  if (a.draw_weight) lignes.push(['Puissance', `${a.draw_weight} lbs`]);
  if (a.bow_length) lignes.push(['Longueur', `${a.bow_length}"`]);
  if (a.draw_length) lignes.push(['Allonge', `${a.draw_length}"`]);
  if (a.spine) lignes.push(['Spine', String(a.spine)]);
  if (a.size) lignes.push(['Taille', a.size]);
  lignes.push(['Livraison', a.shipping ? 'Envoi possible' : 'Remise en main propre']);
  return lignes.filter(([, v]) => v);
}

// ---------------------------------------------------------------------------
// Gabarit
// ---------------------------------------------------------------------------

const gabaritBrut = fs.readFileSync(path.join(exportWeb, 'index.html'), 'utf8');
if (!gabaritBrut.includes('<div id="root"></div>')) {
  throw new Error('index.html de l’export web : conteneur #root introuvable — le gabarit a changé.');
}

/**
 * Une page du site : le gabarit de l'application, avec un en-tête propre à la
 * page et, dans le conteneur, un contenu lisible sans JavaScript.
 */
function page({ titre, description, canonique, image, robots, donnees, contenu, type = 'website', extraTete = '' }) {
  const tete = [
    `<title>${html(titre)}</title>`,
    `<meta name="description" content="${html(description)}" />`,
    canonique ? `<link rel="canonical" href="${html(canonique)}" />` : '',
    robots ? `<meta name="robots" content="${robots}" />` : '',
    '<meta name="theme-color" content="#F5843C" />',
    `<meta property="og:type" content="${type}" />`,
    '<meta property="og:site_name" content="Archers Market" />',
    '<meta property="og:locale" content="fr_FR" />',
    `<meta property="og:title" content="${html(titre)}" />`,
    `<meta property="og:description" content="${html(description)}" />`,
    canonique ? `<meta property="og:url" content="${html(canonique)}" />` : '',
    `<meta property="og:image" content="${html(image ?? `${SITE}/partage.png`)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    extraTete,
    donnees ? `<script type="application/ld+json">${jsonLd(donnees)}</script>` : '',
  ]
    .filter(Boolean)
    .map((l) => `    ${l}`)
    .join('\n');

  return gabaritBrut
    .replace('<html lang="en">', '<html lang="fr">')
    .replace(/<title>[^<]*<\/title>/, tete)
    .replace(
      '<div id="root"></div>',
      // Le contenu reste défilable sans JavaScript : le gabarit d'Expo
      // interdit le défilement du corps de page, que l'application gère seule.
      `<div id="root"><div style="height:100%;overflow:auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1B1B1D">${contenu ?? ''}</div></div>`,
    );
}

const enteteSite = `<header style="padding:16px 20px;border-bottom:1px solid #E4E4E7"><a href="/" style="font-weight:800;letter-spacing:.06em;color:#1B1B1D;text-decoration:none">ARCHERS MARKET</a> · <a href="/materiel-occasion.html" style="color:#DF6F27">Guides</a></header>`;

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

function copier(de, vers, filtre = () => true) {
  for (const entree of fs.readdirSync(de, { withFileTypes: true })) {
    const source = path.join(de, entree.name);
    const cible = path.join(vers, entree.name);
    if (!filtre(entree.name)) continue;
    if (entree.isDirectory()) {
      fs.mkdirSync(cible, { recursive: true });
      copier(source, cible);
    } else {
      fs.copyFileSync(source, cible);
    }
  }
}

function ecrire(relatif, contenu) {
  const cible = path.join(sortie, relatif);
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  fs.writeFileSync(cible, contenu);
}

const annonces = await lireAnnonces();

fs.rmSync(sortie, { recursive: true, force: true });
fs.mkdirSync(sortie, { recursive: true });

// L'application d'abord, les pages écrites à la main ensuite : en cas de
// collision de nom, c'est la page éditoriale qui gagne. Le sitemap et l'index
// de l'application sont refaits plus bas.
copier(exportWeb, sortie, (nom) => nom !== 'metadata.json');
copier(docs, sortie, (nom) => nom !== 'index.html' && nom !== 'sitemap.xml');

// --- L'accueil : le fil d'annonces ----------------------------------------

const organisation = {
  '@type': 'Organization',
  '@id': `${SITE}/#organisation`,
  name: 'Archers Market',
  url: `${SITE}/`,
  logo: `${SITE}/emblem.png`,
  slogan: 'Le marché d’occasion entre archers',
  email: 'contact@archersmarket.fr',
  areaServed: { '@type': 'Country', name: 'France' },
  sameAs: [
    'https://apps.apple.com/fr/app/id6448762227',
    'https://play.google.com/store/apps/details?id=app.archersmarket.android',
  ],
};

const listeAccueil = annonces
  .slice(0, 60)
  .map(
    (a) =>
      `<li style="margin:0 0 10px"><a href="/listing/${a.id}" style="color:#1B1B1D">${html(a.title)}</a> — <strong>${html(prix(a.price))}</strong> · ${html(CATEGORIES[a.category] ?? '')} · ${html(a.city)}</li>`,
  )
  .join('');

ecrire(
  'index.html',
  page({
    titre: 'Archers Market — Matériel de tir à l’arc d’occasion entre archers',
    description:
      'Arcs classiques et à poulies, branches, poignées, viseurs, flèches d’occasion, entre archers. Paiement protégé jusqu’à réception, envoi adapté aux arcs longs. Publier est gratuit.',
    canonique: `${SITE}/`,
    donnees: {
      '@context': 'https://schema.org',
      '@graph': [
        organisation,
        {
          '@type': 'WebSite',
          '@id': `${SITE}/#site`,
          url: `${SITE}/`,
          name: 'Archers Market',
          inLanguage: 'fr-FR',
          publisher: { '@id': `${SITE}/#organisation` },
        },
        {
          '@type': 'ItemList',
          name: 'Dernières annonces',
          itemListElement: annonces.slice(0, 60).map((a, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${SITE}/listing/${a.id}`,
            name: a.title,
          })),
        },
      ],
    },
    contenu: `${enteteSite}<main style="max-width:760px;margin:0 auto;padding:24px 20px"><h1>Le marché d’occasion entre archers</h1><p>Achetez et vendez votre matériel de tir à l’arc d’occasion entre passionnés. Publier est gratuit, et le vendeur touche son prix entier.</p><h2>Dernières annonces</h2><ul style="padding-left:20px">${listeAccueil}</ul><p><a href="/materiel-occasion.html">Guides du matériel d’occasion</a> · <a href="/a-propos.html">À propos</a> · <a href="/mentions-legales.html">Mentions légales</a></p></main>`,
  }),
);

// --- Une page par annonce -----------------------------------------------------

for (const a of annonces) {
  const url = `${SITE}/listing/${a.id}`;
  const categorie = CATEGORIES[a.category] ?? 'Matériel';
  const neuf = a.condition === 'new';
  const titre = `${a.title} — ${prix(a.price)} — Archers Market`;
  const description = resume(
    `${prix(a.price)} · ${categorie} · ${ETATS[a.condition] ?? ''} · ${a.city}. ${a.description}`,
    158,
  );

  const lignes = caracteristiques(a)
    .map(([k, v]) => `<tr><th style="text-align:left;padding:4px 16px 4px 0;color:#5F5F63;font-weight:600">${html(k)}</th><td>${html(v)}</td></tr>`)
    .join('');
  const image = a.photos[0];

  const contenu = `${enteteSite}<main style="max-width:760px;margin:0 auto;padding:24px 20px">
<nav style="font-size:13px;color:#909095"><a href="/">Annonces</a> → <a href="/?category=${html(a.category)}">${html(categorie)}</a></nav>
<h1 style="margin:8px 0">${html(a.title)}</h1>
<p style="font-size:24px;font-weight:800;color:#DF6F27;margin:0 0 12px">${html(prix(a.price))}</p>
${image ? `<img src="${html(image)}" alt="${html(a.title)}" width="720" style="max-width:100%;height:auto;border-radius:12px" />` : ''}
<h2>Description</h2>
<p style="white-space:pre-line">${html(a.description)}</p>
<h2>Caractéristiques</h2>
<table>${lignes}</table>
<p>À ${html(a.city)}. Paiement protégé jusqu’à la réception, ou remise en main propre.</p>
<p><a href="/installer.html">Installer l’application Archers Market</a></p>
</main>`;

  const donnees = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: a.title,
        description: resume(a.description, 500),
        image: a.photos.length ? a.photos : undefined,
        brand: a.brand ? { '@type': 'Brand', name: a.brand } : undefined,
        category: categorie,
        offers: {
          '@type': 'Offer',
          url,
          price: Number(a.price).toFixed(2),
          priceCurrency: 'EUR',
          itemCondition: neuf ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
          availability:
            a.status === 'reserved' ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock',
          areaServed: { '@type': 'Country', name: 'France' },
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Annonces', item: `${SITE}/` },
          // Le fil filtré sur la catégorie : l'accueil lit `?category=` au démarrage.
          { '@type': 'ListItem', position: 2, name: categorie, item: `${SITE}/?category=${a.category}` },
          { '@type': 'ListItem', position: 3, name: a.title, item: url },
        ],
      },
    ],
  };

  ecrire(
    `listing/${a.id}.html`,
    page({
      titre,
      description,
      canonique: url,
      image,
      type: 'product',
      donnees,
      contenu,
      extraTete: [
        `<meta property="product:price:amount" content="${Number(a.price).toFixed(2)}" />`,
        '<meta property="product:price:currency" content="EUR" />',
      ].join('\n    '),
    }),
  );
}

// --- Les écrans de l'application qui ont une adresse fixe ---------------------

// Servis avec un vrai 200 plutôt que par le repli 404.html. Les recherches
// intéressent les moteurs ; les écrans personnels, non : ils sont marqués
// `noindex`, ce qui n'empêche personne de s'en servir.
const ECRANS = {
  wanted: { titre: 'Ce que les archers cherchent — Archers Market', index: true },
  favorites: { titre: 'Mes favoris — Archers Market' },
  messages: { titre: 'Messages — Archers Market' },
  profile: { titre: 'Mon compte — Archers Market' },
  sell: { titre: 'Déposer une annonce — Archers Market' },
  login: { titre: 'Connexion — Archers Market' },
  register: { titre: 'Créer un compte — Archers Market' },
  'forgot-password': { titre: 'Mot de passe oublié — Archers Market' },
  'verify-email': { titre: 'Confirmez votre adresse — Archers Market' },
  orders: { titre: 'Mes commandes — Archers Market' },
  import: { titre: 'Importer une annonce — Archers Market' },
};
for (const [chemin, { titre, index }] of Object.entries(ECRANS)) {
  ecrire(
    `${chemin}.html`,
    page({
      titre,
      description: 'Le marché d’occasion entre archers : arcs, branches, poignées, viseurs et flèches.',
      canonique: index ? `${SITE}/${chemin}` : undefined,
      robots: index ? undefined : 'noindex, follow',
    }),
  );
}

// --- Le repli : toute autre adresse reçoit l'application ----------------------

// GitHub Pages sert 404.html pour une adresse inconnue, avec un code 404.
// C'est l'application elle-même : son routeur affiche l'écran demandé — une
// conversation, une commande, une annonce publiée depuis la dernière
// construction. Le code 404 n'empêche pas l'affichage ; il dit seulement aux
// moteurs de ne pas indexer, ce qui est juste pour ces adresses.
ecrire(
  '404.html',
  page({
    titre: 'Archers Market — le marché d’occasion entre archers',
    description: 'Le marché d’occasion entre archers.',
    robots: 'noindex, follow',
  }),
);

// --- Le sitemap ----------------------------------------------------------------

const fixes = [...fs.readFileSync(path.join(docs, 'sitemap.xml'), 'utf8').matchAll(/<url>[\s\S]*?<\/url>/g)].map(
  (m) => m[0],
);
const jour = (date) => String(date).slice(0, 10);
const pagesAnnonces = annonces.map(
  (a) =>
    `  <url>\n    <loc>${SITE}/listing/${a.id}</loc>\n    <lastmod>${jour(a.updated_at ?? a.created_at)}</lastmod>\n    <priority>0.7</priority>\n  </url>`,
);
const recherches = `  <url>\n    <loc>${SITE}/wanted</loc>\n    <priority>0.6</priority>\n  </url>`;
ecrire(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<!-- Construit par scripts/site/construire.mjs : pages éditoriales de docs/sitemap.xml, puis une entrée par annonce publiée. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${fixes.map((u) => `  ${u}`).join('\n')}
${recherches}
${pagesAnnonces.join('\n')}
</urlset>
`,
);

console.log(
  `site assemblé dans ${sortie} : ${annonces.length} annonce(s), ${Object.keys(ECRANS).length} écran(s) à adresse fixe, ${fixes.length + 1 + annonces.length} URL au sitemap`,
);
