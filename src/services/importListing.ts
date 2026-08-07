import { brands, categories } from '@/data/catalog';
import type { CategoryId, ConditionId, Handedness, NewListingInput } from '@/types';

/** Champs devinés à partir d'une annonce existante ; tout reste modifiable. */
export interface ImportedListing extends Partial<NewListingInput> {
  title?: string;
  description?: string;
  price?: number;
  city?: string;
  /** URL distantes des photos, à télécharger avant publication. */
  photoUrls?: string[];
  /** Champs déduits du texte plutôt que lus tels quels. */
  guessed: Array<keyof NewListingInput>;
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// ---------------------------------------------------------------------------
// Lecture d'une page d'annonce
// ---------------------------------------------------------------------------

const decodeEntities = (text: string) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

/**
 * Extrait l'annonce d'une page leboncoin. Les pages exposent leurs données
 * dans __NEXT_DATA__ ; le JSON-LD sert de repli pour les autres sites.
 */
export function extractFromHtml(html: string): ImportedListing | null {
  const next = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (next) {
    try {
      const data = JSON.parse(next[1]);
      const ad = findAd(data);
      if (ad) {
        return {
          title: ad.subject,
          description: ad.body,
          price: Array.isArray(ad.price) ? Number(ad.price[0]) : Number(ad.price) || undefined,
          city: ad.location?.city,
          photoUrls: ad.images?.urls_large ?? ad.images?.urls ?? [],
          guessed: [],
        };
      }
    } catch {
      // Structure inattendue : on tente le JSON-LD.
    }
  }

  for (const match of html.matchAll(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    const found = readJsonLd(match[1]);
    if (found) return found;
  }

  // Dernier recours : les métadonnées Open Graph.
  const meta = (property: string) =>
    new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`).exec(html)?.[1];
  const title = meta('og:title');
  if (!title) return null;
  return {
    title: decodeEntities(title),
    description: decodeEntities(meta('og:description') ?? ''),
    photoUrls: [meta('og:image')].filter(Boolean) as string[],
    guessed: [],
  };
}

/** Lit un bloc JSON-LD : le format que la plupart des sites de vente exposent. */
function readJsonLd(block: string): ImportedListing | null {
  try {
    const json = JSON.parse(block);
    const node = [json, ...(json['@graph'] ?? [])].find(
      (n: { '@type'?: string }) => n?.['@type'] === 'Product' || n?.['@type'] === 'Offer',
    );
    if (!node) return null;
    const offer = node.offers ?? node;
    return {
      title: node.name,
      description: node.description,
      price: Number(offer?.price) || undefined,
      city: offer?.availableAtOrFrom?.address?.addressLocality,
      photoUrls: [node.image].flat().filter(Boolean) as string[],
      guessed: [],
    };
  } catch {
    return null;
  }
}

interface RawAd {
  subject?: string;
  body?: string;
  price?: number | number[];
  location?: { city?: string };
  images?: { urls?: string[]; urls_large?: string[] };
}

/** Localise l'objet annonce dans l'arborescence __NEXT_DATA__. */
function findAd(node: unknown, depth = 0): RawAd | null {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  const candidate = node as RawAd;
  if (typeof candidate.subject === 'string' && candidate.price !== undefined) return candidate;
  for (const value of Object.values(node)) {
    const found = findAd(value, depth + 1);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lecture métier : ce qu'un texte d'annonce dit du matériel
// ---------------------------------------------------------------------------

const CATEGORY_HINTS: Array<{ id: CategoryId; patterns: RegExp }> = [
  { id: 'bow-compound', patterns: /\b(poulies?|compound|modules?|cames?)\b/g },
  { id: 'bow-longbow', patterns: /\b(longbow|traditionnel|arc droit|flatbow)\b/g },
  { id: 'arrows', patterns: /\b(fleches?|tubes?|spine|empennage|plumes?|pointes?)\b/g },
  { id: 'sight', patterns: /\b(viseur|scope|berger|button|palpeur|dioptrie)\b/g },
  { id: 'stabilizer', patterns: /\b(stabilisation|stabilisateur|v-?bar|amortisseur)\b/g },
  { id: 'release', patterns: /\b(decocheur|palette|onglet|gant de tir)\b/g },
  { id: 'quiver', patterns: /\b(carquois)\b/g },
  { id: 'protection', patterns: /\b(protege-?bras|bracelet|plastron|garde-?poitrine)\b/g },
  { id: 'string', patterns: /\b(corde|tranche-?fil|serving|dacron|bcy|fastflight)\b/g },
  { id: 'target', patterns: /\b(cible|blason|mousse|trepied|butte)\b/g },
  { id: 'apparel', patterns: /\b(housse|valise|sac de tir|tee-?shirt|veste)\b/g },
  { id: 'bow-recurve', patterns: /\b(classique|recurve|branches?|poignee|riser|arc)\b/g },
];

/** Marques ne fabriquant qu'un type d'arc : indice fort quand le texte est avare. */
const BRAND_CATEGORY: Record<string, CategoryId> = {
  Mathews: 'bow-compound',
  PSE: 'bow-compound',
  Elite: 'bow-compound',
  'Bear Archery': 'bow-longbow',
  Uukha: 'bow-recurve',
  'Win&Win': 'bow-recurve',
  'MK Korea': 'bow-recurve',
  Gillo: 'bow-recurve',
  Easton: 'arrows',
  Skylon: 'arrows',
  Victory: 'arrows',
  Shibuya: 'sight',
  Axcel: 'sight',
};

// L'ordre compte : « comme neuf » doit être reconnu avant « neuf ».
const CONDITION_HINTS: Array<{ id: ConditionId; patterns: RegExp }> = [
  { id: 'like-new', patterns: /\b(comme neuf|etat neuf|tres peu servi|quasi neuf)\b/ },
  { id: 'new', patterns: /\b(neuf|neuve|jamais servi|jamais utilise|sous blister)\b/ },
  { id: 'very-good', patterns: /\b(tres bon etat|tbe\b|excellent etat)\b/ },
  { id: 'good', patterns: /\b(bon etat|\bbe\b|quelques rayures)\b/ },
  { id: 'fair', patterns: /\b(etat correct|a reviser|pour pieces|usure marquee)\b/ },
];

/**
 * Devine les caractéristiques d'archerie à partir du texte de l'annonce.
 * Rien n'est imposé : les valeurs trouvées ne sont que des propositions.
 */
export function parseArchery(
  rawText: string,
  rawTitle = '',
): Partial<NewListingInput> & { guessed: Array<keyof NewListingInput> } {
  // « 4000 flèches tirées » décrit l'usage d'un arc, pas l'objet vendu.
  const text = normalize(rawText).replace(/fleches? (tirees?|decochees?)/g, '');
  const title = normalize(rawTitle);
  const guessed: Array<keyof NewListingInput> = [];
  const result: Partial<NewListingInput> = {};

  const brandFound = brands.find(
    (name) => name !== 'Autre' && new RegExp(`\\b${normalize(name).replace(/[&+]/g, '.')}\\b`).test(text),
  );

  // Le titre pèse plus lourd que le corps : c'est là qu'on nomme l'objet.
  const scores = CATEGORY_HINTS.map((hint) => {
    const inTitle = (title.match(hint.patterns) ?? []).length;
    const inBody = (text.match(hint.patterns) ?? []).length;
    const fromBrand = brandFound && BRAND_CATEGORY[brandFound] === hint.id ? 2 : 0;
    return { id: hint.id, score: inTitle * 3 + inBody + fromBrand };
  }).sort((a, b) => b.score - a.score);

  if (scores[0].score > 0) {
    result.category = scores[0].id;
    guessed.push('category');
  }

  const condition = CONDITION_HINTS.find((hint) => hint.patterns.test(text));
  if (condition) {
    result.condition = condition.id;
    guessed.push('condition');
  }

  if (brandFound) {
    result.brand = brandFound;
    guessed.push('brand');
  }

  // Main d'arc : « droitier » / « gaucher », ou RH / LH.
  if (/\b(gaucher|gauchere|left ?hand|\blh\b)\b/.test(text)) {
    result.handedness = 'left' as Handedness;
    guessed.push('handedness');
  } else if (/\b(droitier|droitiere|right ?hand|\brh\b)\b/.test(text)) {
    result.handedness = 'right' as Handedness;
    guessed.push('handedness');
  }

  // Puissance : « 38 lbs », « 38 livres », « 38# »
  const weight = /(\d{1,2}(?:[.,]\d)?)\s*(?:lbs?\b|livres?\b|#)/.exec(text);
  if (weight) {
    result.drawWeight = Number(weight[1].replace(',', '.'));
    guessed.push('drawWeight');
  }

  // Longueur : arc complet (48 à 72") ou taille de poignée (15 à 27")
  const length = /\b(\d{2})\s*(?:"|''|pouces?|inch)/.exec(text);
  const lengthValue = length ? Number(length[1]) : 0;
  if ((lengthValue >= 15 && lengthValue <= 27) || (lengthValue >= 48 && lengthValue <= 72)) {
    result.bowLength = lengthValue;
    guessed.push('bowLength');
  }

  // Allonge des arcs à poulies : « allonge 29,5 »
  const draw = /allonge\s*(?:de\s*)?(\d{2}(?:[.,]\d)?)/.exec(text);
  if (draw) {
    result.drawLength = Number(draw[1].replace(',', '.'));
    guessed.push('drawLength');
  }

  const spine = /\bspine\s*:?\s*(\d{3,4})\b/.exec(text);
  if (spine) {
    result.spine = Number(spine[1]);
    guessed.push('spine');
  }

  if (/\b(envoi|expedition|colissimo|mondial relay|port )\b/.test(text)) {
    result.shipping = true;
    guessed.push('shipping');
  }

  return { ...result, guessed };
}

/** Prix trouvé dans un texte libre, quand la page ne le donne pas. */
export function parsePrice(text: string): number | undefined {
  const match = /(\d[\d\s]{0,6})\s*(?:€|eur\b|euros?\b)/i.exec(text);
  if (!match) return undefined;
  const value = Number(match[1].replace(/\s/g, ''));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Assemble page et texte en une proposition d'annonce complète. */
export function buildImport(source: ImportedListing | null, rawText: string): ImportedListing {
  const base: ImportedListing = source ?? { guessed: [] };
  const corpus = [base.title, base.description, rawText].filter(Boolean).join('\n');
  const archery = parseArchery(corpus, base.title ?? '');

  // Sur un texte collé, la première ligne fait le titre : la laisser aussi en
  // tête de description la ferait apparaître deux fois dans l'annonce.
  const lines = rawText.split('\n');
  const headline = lines.findIndex((line) => line.trim().length > 5);
  const rest = headline >= 0 ? lines.slice(headline + 1).join('\n').trim() : '';

  return {
    ...base,
    ...archery,
    title: base.title ?? (headline >= 0 ? lines[headline].trim() : undefined),
    description: base.description ?? (rest.length >= 20 ? rest : rawText.trim()),
    price: base.price ?? parsePrice(corpus),
    guessed: [...(base.guessed ?? []), ...archery.guessed],
  };
}

export const isSupportedUrl = (value: string): boolean => {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Lecture depuis l'appareil
//
// leboncoin refuse les requêtes venant d'un serveur (403 anti-robot). La page
// est donc chargée dans une WebView, avec le navigateur et l'adresse IP de
// l'utilisateur. Le script ci-dessous s'exécute dans la page et ne renvoie que
// l'essentiel : recopier tout le HTML par le pont natif coûterait plusieurs
// mégaoctets.
// ---------------------------------------------------------------------------

/** Ce que la page renvoie à l'application. */
export interface PagePayload {
  ad?: RawAd | null;
  jsonLd?: string[];
  og?: { title?: string; description?: string; image?: string };
  /** Texte visible, filet de sécurité quand la page n'expose aucune donnée. */
  text?: string;
}

export const PAGE_SCRIPT = `
(function () {
  if (window.__amGrab) return;
  window.__amGrab = true;

  function findAd(node, depth) {
    if (!node || typeof node !== 'object' || depth > 8) return null;
    if (typeof node.subject === 'string' && node.price !== undefined) return node;
    for (var key in node) {
      try {
        var found = findAd(node[key], depth + 1);
        if (found) return found;
      } catch (e) {}
    }
    return null;
  }

  function meta(property) {
    var tag = document.querySelector('meta[property="' + property + '"]');
    return tag ? tag.getAttribute('content') : undefined;
  }

  function collect() {
    var ad = null;
    var raw = document.getElementById('__NEXT_DATA__');
    if (raw) {
      try {
        var found = findAd(JSON.parse(raw.textContent), 0);
        if (found) {
          ad = {
            subject: found.subject,
            body: found.body,
            price: found.price,
            location: found.location ? { city: found.location.city } : undefined,
            images: found.images
              ? { urls_large: (found.images.urls_large || found.images.urls || []).slice(0, 8) }
              : undefined,
          };
        }
      } catch (e) {}
    }

    var jsonLd = [];
    var blocks = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < blocks.length && i < 6; i++) jsonLd.push(blocks[i].textContent.slice(0, 20000));

    return {
      ad: ad,
      jsonLd: jsonLd,
      og: { title: meta('og:title'), description: meta('og:description'), image: meta('og:image') },
      text: (document.body ? document.body.innerText : '').slice(0, 8000),
    };
  }

  var tries = 0;
  function attempt() {
    tries++;
    var ready =
      document.getElementById('__NEXT_DATA__') ||
      document.querySelector('script[type="application/ld+json"]');
    if (ready || tries > 24) {
      window.__amGrab = false;
      window.ReactNativeWebView.postMessage(JSON.stringify(collect()));
    } else {
      setTimeout(attempt, 500);
    }
  }
  attempt();
})();
true;
`;

/** Reconstitue une annonce à partir de ce que la page a renvoyé. */
export function extractFromPage(payload: PagePayload): ImportedListing | null {
  const { ad } = payload;
  if (ad?.subject) {
    return {
      title: ad.subject,
      description: ad.body,
      price: Array.isArray(ad.price) ? Number(ad.price[0]) : Number(ad.price) || undefined,
      city: ad.location?.city,
      photoUrls: ad.images?.urls_large ?? ad.images?.urls ?? [],
      guessed: [],
    };
  }

  for (const block of payload.jsonLd ?? []) {
    const found = readJsonLd(block);
    if (found) return found;
  }

  const title = payload.og?.title;
  if (!title) return null;
  return {
    title: decodeEntities(title),
    description: decodeEntities(payload.og?.description ?? ''),
    photoUrls: [payload.og?.image].filter(Boolean) as string[],
    guessed: [],
  };
}

/**
 * Assemble ce que la page a livré. Le texte visible ne sert de matière au
 * décodage que si la page n'a pas donné de description : sur une page
 * d'annonce, le reste de l'écran parle d'autres objets.
 */
export function importFromPage(payload: PagePayload): ImportedListing | null {
  const source = extractFromPage(payload);
  if (!source?.title) return null;
  return buildImport(source, source.description ? '' : (payload.text ?? ''));
}

// ---------------------------------------------------------------------------
// Passage de relais vers l'écran de publication
//
// Le brouillon transite en mémoire plutôt que par les paramètres de route :
// une annonce complète, photos comprises, ne tient pas dans une URL.
// ---------------------------------------------------------------------------

let pendingDraft: ImportedListing | null = null;

export const setImportDraft = (draft: ImportedListing | null): void => {
  pendingDraft = draft;
};

/** Retourne le brouillon en attente et le retire : il ne sert qu'une fois. */
export const consumeImportDraft = (): ImportedListing | null => {
  const draft = pendingDraft;
  pendingDraft = null;
  return draft;
};
