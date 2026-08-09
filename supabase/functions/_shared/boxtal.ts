/**
 * Accès à Boxtal depuis les fonctions Edge.
 *
 * L'API v1 est un service à l'ancienne : paramètres à plat en notation
 * pointée, réponses en XML, et une en-tête `Authorization` qui porte le
 * base64 des identifiants *sans* le mot `Basic`. Ce n'est pas une coquille :
 * c'est ce que fait leur propre bibliothèque, et un `Basic` en préfixe se
 * fait rejeter.
 *
 * On lit le XML avec un analyseur minimal plutôt qu'une dépendance : les
 * réponses attendues sont plates et connues, et une bibliothèque de plus sur
 * un chemin qui achète des étiquettes est une bibliothèque de plus à suivre.
 */

const PROD = 'https://www.envoimoinscher.com/';
const TEST = 'https://test.envoimoinscher.com/';
const DOCS_PROD = 'https://documents.envoimoinscher.com/documents';
const DOCS_TEST = 'https://test.envoimoinscher.com/documents';

/** Le bac à sable tant que `BOXTAL_ENV` ne dit pas explicitement `production`. */
const enProduction = (): boolean => Deno.env.get('BOXTAL_ENV') === 'production';

export const boxtalBase = (): string => (enProduction() ? PROD : TEST);
export const boxtalDocs = (): string => (enProduction() ? DOCS_PROD : DOCS_TEST);

function credentials(): string {
  const user = Deno.env.get('BOXTAL_USER');
  const pass = Deno.env.get('BOXTAL_PASSWORD');
  if (!user || !pass) throw new Error('Identifiants Boxtal absents de la configuration.');
  return btoa(`${user}:${pass}`);
}

/** Boxtal attend ses paramètres à plat : `shipper.city`, `colis_1.poids`… */
export type BoxtalParams = Record<string, string | number | boolean>;

const encode = (params: BoxtalParams): string =>
  Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

async function boxtalRequest(
  method: 'GET' | 'POST',
  action: string,
  params: BoxtalParams,
): Promise<XmlNode> {
  const headers: Record<string, string> = {
    Authorization: credentials(),
    'Accept-Language': 'fr_FR',
    'Api-Version': '1',
  };
  const body = encode(params);
  const url = `${boxtalBase()}${action}${method === 'GET' && body ? `?${body}` : ''}`;

  if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';

  const response = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? body : undefined,
  });
  const text = await response.text();

  // Boxtal répond 200 même pour dire non : c'est le corps qui porte l'erreur.
  const document = parseXml(text);
  const erreur = firstText(document, 'message') ?? firstText(document, 'error');
  if (!response.ok || (erreur && findAll(document, 'error').length > 0)) {
    throw new Error(erreur ?? `Boxtal a répondu ${response.status}.`);
  }
  return document;
}

export const boxtalGet = (action: string, params: BoxtalParams) =>
  boxtalRequest('GET', action, params);
export const boxtalPost = (action: string, params: BoxtalParams) =>
  boxtalRequest('POST', action, params);

/**
 * Récupère l'étiquette (« waybill ») d'une ou plusieurs expéditions. Le
 * document revient en PDF binaire, pas en XML.
 */
export async function fetchLabel(reference: string): Promise<Uint8Array> {
  const url = `${boxtalDocs()}?type=waybill&envoi=${encodeURIComponent(reference)}`;
  const response = await fetch(url, {
    headers: { Authorization: credentials(), 'Api-Version': '1' },
  });
  if (!response.ok) throw new Error(`Étiquette indisponible (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Un analyseur XML de la taille du besoin
//
// On ne cherche pas à couvrir XML : on veut lire un arbre d'éléments avec du
// texte. Les commentaires, instructions et CDATA sont traités ; le reste est
// hors sujet pour ces réponses-là.
// ---------------------------------------------------------------------------

export interface XmlNode {
  name: string;
  text: string;
  children: XmlNode[];
}

export function parseXml(source: string): XmlNode {
  const nettoye = source
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, contenu) => contenu);

  const racine: XmlNode = { name: '#root', text: '', children: [] };
  const pile: XmlNode[] = [racine];
  const jetons = /<\s*(\/)?\s*([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/)?\s*>/g;

  let position = 0;
  let jeton: RegExpExecArray | null;
  while ((jeton = jetons.exec(nettoye)) !== null) {
    const [entier, fermant, nom, , autoFermant] = jeton;
    const texte = nettoye.slice(position, jeton.index);
    if (texte.trim()) pile[pile.length - 1].text += decodeEntities(texte);
    position = jeton.index + entier.length;

    if (fermant) {
      if (pile.length > 1 && pile[pile.length - 1].name === nom) pile.pop();
      continue;
    }
    const noeud: XmlNode = { name: nom, text: '', children: [] };
    pile[pile.length - 1].children.push(noeud);
    if (!autoFermant) pile.push(noeud);
  }
  return racine;
}

const ENTITES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

const decodeEntities = (value: string): string =>
  value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (entier, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    }
    if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return ENTITES[code] ?? entier;
  });

/** Tous les descendants portant ce nom, à n'importe quelle profondeur. */
export function findAll(node: XmlNode, name: string): XmlNode[] {
  const trouves: XmlNode[] = [];
  for (const enfant of node.children) {
    if (enfant.name === name) trouves.push(enfant);
    trouves.push(...findAll(enfant, name));
  }
  return trouves;
}

export const find = (node: XmlNode, name: string): XmlNode | null =>
  findAll(node, name)[0] ?? null;

/** Le texte du premier descendant portant ce nom, ou null. */
export function firstText(node: XmlNode, name: string): string | null {
  const trouve = find(node, name);
  const texte = trouve?.text.trim();
  return texte ? texte : null;
}

/** Descend un chemin d'enfants directs : path(offre, 'price', 'tax-inclusive'). */
export function path(node: XmlNode | null, ...names: string[]): XmlNode | null {
  let courant = node;
  for (const nom of names) {
    courant = courant?.children.find((enfant) => enfant.name === nom) ?? null;
    if (!courant) return null;
  }
  return courant;
}

export const pathText = (node: XmlNode | null, ...names: string[]): string | null => {
  const texte = path(node, ...names)?.text.trim();
  return texte ? texte : null;
};

// ---------------------------------------------------------------------------
// Formats de colis
//
// Le tir à l'arc expédie du long. Un format se traduit en poids et
// dimensions ; c'est ce couple que Boxtal utilise pour écarter les
// transporteurs qui ne prennent pas la longueur.
// ---------------------------------------------------------------------------

export interface Parcel {
  poids: number;    // kg
  longueur: number; // cm
  largeur: number;  // cm
  hauteur: number;  // cm
}

export const PARCELS: Record<string, Parcel> = {
  small:  { poids: 1, longueur: 25,  largeur: 20, hauteur: 10 },
  medium: { poids: 3, longueur: 60,  largeur: 25, hauteur: 15 },
  long:   { poids: 3, longueur: 90,  largeur: 20, hauteur: 15 },
  xl:     { poids: 8, longueur: 130, largeur: 35, hauteur: 20 },
};

/** Faute de format renseigné, on suppose le plus courant plutôt que rien. */
export const parcelOf = (size: string | null | undefined): Parcel =>
  PARCELS[size ?? ''] ?? PARCELS.medium;

/** Code catégorie Boxtal : « articles de sport ». */
export const CONTENU_SPORT = 10120;

/**
 * Les paramètres que l'on sait fournir à la commande.
 *
 * Relevé sur une vraie cotation : chaque offre annonce ce qu'elle exigera, et
 * les exigences varient d'un transporteur à l'autre. Plutôt que de découvrir
 * un manque au moment d'acheter l'étiquette — trop tard, l'acheteur a déjà
 * payé — on écarte à la cotation toute offre réclamant autre chose que ceci.
 *
 * `type_emballage.emballage` en est volontairement absent : trois offres sur
 * vingt-six le demandent, et nous ne savons pas quel emballage le vendeur
 * utilisera.
 */
const PARAMETRES_CONNUS = new Set([
  'colis.description', 'colis.valeur',
  'expediteur.civilite', 'expediteur.nom', 'expediteur.prenom',
  'expediteur.adresse', 'expediteur.email', 'expediteur.telephone',
  'destinataire.civilite', 'destinataire.nom', 'destinataire.prenom',
  'destinataire.adresse', 'destinataire.email', 'destinataire.telephone',
  'depot.pointrelais', 'retrait.pointrelais',
]);

/** L'offre ne réclame-t-elle que des choses que nous savons donner ? */
export const offreRealisable = (offer: Offer): boolean =>
  offer.mandatory.every((code) => PARAMETRES_CONNUS.has(code));

/**
 * Point de retrait, choisi par l'acheteur. On se fie à ce que l'offre déclare
 * exiger, pas à son type de livraison : une offre Colissimo livre en
 * « PickupStation » sans jamais réclamer de point de retrait.
 */
export const exigePointRetrait = (offer: Offer): boolean =>
  offer.mandatory.includes('retrait.pointrelais');

/** Point de dépôt, choisi par le vendeur : là où il remet le colis. */
export const exigePointDepot = (offer: Offer): boolean =>
  offer.mandatory.includes('depot.pointrelais');

/** Aplatit un colis en paramètres `colis_1.*`. */
export const parcelParams = (parcel: Parcel): BoxtalParams => ({
  'colis_1.poids': parcel.poids,
  'colis_1.longueur': parcel.longueur,
  'colis_1.largeur': parcel.largeur,
  'colis_1.hauteur': parcel.hauteur,
});

// ---------------------------------------------------------------------------
// Offres
// ---------------------------------------------------------------------------

export interface Offer {
  operatorCode: string;
  operatorLabel: string;
  serviceCode: string;
  serviceLabel: string;
  /** Prix toutes taxes comprises, en centimes. */
  priceCents: number;
  /** DROPOFF_POINT quand le vendeur doit déposer en point relais. */
  collectionType: string;
  /** PICKUP_POINT quand l'acheteur retire en point relais. */
  deliveryType: string;
  deliveryLabel: string;
  /**
   * Date de livraison annoncée, au format ISO.
   *
   * Elle est captée à part parce que chaque transporteur la formate à sa
   * façon dans son libellé : « le 13/08/2026 » chez Mondial Relay,
   * « le 2026-08-13 » chez UPS. Les mêler à l'écran donne une liste qui a
   * l'air cassée.
   */
  deliveryDate: string | null;
  /**
   * Les paramètres que l'offre exige à la commande, par leur code Boxtal.
   * `retrait.pointrelais` y figure pour toute livraison en relais : réserver
   * sans le fournir se solde par un refus.
   */
  mandatory: string[];
}

/** Retire la date que le transporteur a collée à son libellé. */
const nettoieLibelle = (libelle: string): string =>
  libelle
    .replace(/\s+le\s+\d{4}-\d{2}-\d{2}\s*$/i, '')
    .replace(/\s+le\s+\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\s*$/i, '')
    .trim();

const cents = (value: string | null): number =>
  value ? Math.round(Number(value.replace(',', '.')) * 100) : 0;

/**
 * Extrait les offres commandables d'une cotation. Le mode `SYN` est
 * consultatif — l'afficher reviendrait à proposer un transporteur qu'on ne
 * sait pas réserver.
 */
export function readOffers(document: XmlNode): Offer[] {
  return findAll(document, 'offer')
    .filter((offre) => (pathText(offre, 'mode') ?? 'COM') === 'COM')
    .map((offre) => ({
      operatorCode: pathText(offre, 'operator', 'code') ?? '',
      operatorLabel: pathText(offre, 'operator', 'label') ?? '',
      serviceCode: pathText(offre, 'service', 'code') ?? '',
      serviceLabel: pathText(offre, 'service', 'label') ?? '',
      priceCents: cents(
        pathText(offre, 'price', 'tax-inclusive') ?? pathText(offre, 'price', 'tax-exclusive'),
      ),
      collectionType: pathText(offre, 'collection', 'type', 'code') ?? '',
      deliveryType: pathText(offre, 'delivery', 'type', 'code') ?? '',
      deliveryLabel: nettoieLibelle(pathText(offre, 'delivery', 'label') ?? ''),
      deliveryDate: pathText(offre, 'delivery', 'date'),
      mandatory: (path(offre, 'mandatory_informations')?.children ?? [])
        .filter((parametre) => parametre.name === 'parameter')
        .map((parametre) => pathText(parametre, 'code') ?? '')
        .filter(Boolean),
    }))
    .filter((offre) => offre.operatorCode && offre.serviceCode && offre.priceCents > 0);
}
