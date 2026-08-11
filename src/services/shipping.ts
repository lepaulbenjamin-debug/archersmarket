import { fail, supabase } from '@/services/supabase';
import type { Cents } from '@/services/payments';

/**
 * Expéditions.
 *
 * La plateforme achète l'étiquette avec le port encaissé auprès de
 * l'acheteur : le vendeur n'avance rien et n'ouvre aucun compte transporteur.
 * Comme pour le paiement, rien ne se décide ici — les tarifs viennent des
 * fonctions Edge, qui seules parlent à Boxtal.
 */

// ---------------------------------------------------------------------------
// Format du colis
//
// Le tir à l'arc expédie du long : des branches font 90 cm, un arc en valise
// en fait 130. Un transporteur qui plafonne à 120 cm doit être écarté avant
// d'être proposé, d'où ce choix demandé au vendeur.
// ---------------------------------------------------------------------------

export type ParcelSize = 'small' | 'medium' | 'long' | 'xl';

export interface ParcelPreset {
  value: ParcelSize;
  label: string;
  hint: string;
  /** Ce que le format autorise, tel qu'annoncé au transporteur. */
  detail: string;
}

export const PARCEL_SIZES: ParcelPreset[] = [
  { value: 'small', label: 'Petit', hint: 'Viseur, décocheur, palette', detail: 'jusqu’à 1 kg · 25 cm' },
  { value: 'medium', label: 'Moyen', hint: 'Poignée, stabilisateur', detail: 'jusqu’à 3 kg · 60 cm' },
  { value: 'long', label: 'Long', hint: 'Branches, tube de flèches', detail: 'jusqu’à 3 kg · 90 cm' },
  { value: 'xl', label: 'Très long', hint: 'Arc complet en valise', detail: 'jusqu’à 8 kg · 130 cm' },
];

export const parcelLabel = (size: ParcelSize | null | undefined): string =>
  PARCEL_SIZES.find((preset) => preset.value === size)?.label ?? 'Non précisé';

/**
 * Format proposé d'office selon la catégorie. Ce n'est qu'une suggestion : le
 * vendeur reste seul juge de ce qu'il met dans son carton.
 */
export function suggestedParcel(category: string): ParcelSize {
  if (['sight', 'release', 'protection', 'string', 'tools', 'arrow-parts'].includes(category)) {
    return 'small';
  }
  if (['limbs', 'arrows', 'stabilizer', 'quiver'].includes(category)) return 'long';
  if (['bow-recurve', 'bow-compound', 'bow-longbow', 'target'].includes(category)) return 'xl';
  return 'medium';
}

// ---------------------------------------------------------------------------
// Adresse d'expédition du vendeur
//
// Privée : une étiquette porte deux adresses, et celle du vendeur ne peut pas
// vivre sur un profil public.
// ---------------------------------------------------------------------------

/** Les transporteurs n'acceptent que « M » ou « Mme ». Ce n'est pas notre choix. */
export type Civility = 'M' | 'Mme';

export interface SellerAddress {
  civility: Civility;
  fullName: string;
  address: string;
  zip: string;
  city: string;
  country: string;
  phone: string;
}

export async function fetchSellerAddress(): Promise<SellerAddress | null> {
  const { data, error } = await supabase
    .from('seller_addresses')
    .select('civility, full_name, address, zip, city, country, phone')
    .maybeSingle();
  if (error) fail(error, 'Adresse d’expédition indisponible.');
  if (!data) return null;
  return {
    civility: (data.civility as Civility) ?? 'M',
    fullName: data.full_name as string,
    address: data.address as string,
    zip: data.zip as string,
    city: data.city as string,
    country: data.country as string,
    phone: data.phone as string,
  };
}

export async function saveSellerAddress(address: SellerAddress): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  const userId = session.user?.id;
  if (!userId) fail(null, 'Connexion requise.');

  const { error } = await supabase.from('seller_addresses').upsert({
    user_id: userId,
    civility: address.civility,
    full_name: address.fullName.trim(),
    address: address.address.trim(),
    zip: address.zip.trim(),
    city: address.city.trim(),
    country: (address.country || 'FR').trim().toUpperCase(),
    phone: address.phone.trim(),
    updated_at: new Date().toISOString(),
  });
  if (error) fail(error, 'Enregistrement de l’adresse impossible.');
}

// ---------------------------------------------------------------------------
// Livraison choisie par l'acheteur
// ---------------------------------------------------------------------------

export type ShippingMode = 'home' | 'relay' | 'hand';

export interface DeliveryAddress {
  civility: Civility;
  name: string;
  address: string;
  zip: string;
  city: string;
  country: string;
  phone: string;
}

export interface ShippingOffer {
  operatorCode: string;
  operatorLabel: string;
  serviceCode: string;
  serviceLabel: string;
  /** Port et assurance réunis : c'est ce que l'acheteur paiera. */
  priceCents: Cents;
  /**
   * Part d'assurance comprise dans le prix, ou zéro. Au-dessus de cent euros,
   * l'envoi est couvert à hauteur du prix de l'objet : la responsabilité des
   * transporteurs s'arrête à vingt-trois euros le kilo, ce qui ne rembourse
   * pas un arc.
   */
  insuranceCents: Cents;
  collectionType: string;
  deliveryType: string;
  deliveryLabel: string;
  /** Date annoncée, au format ISO. Chaque transporteur la formatait autrement. */
  deliveryDate: string | null;
  mandatory: string[];
}

/**
 * L'acheteur doit-il choisir un point de retrait ?
 *
 * On se fie à ce que l'offre déclare exiger, pas à son type de livraison :
 * relevé sur une vraie cotation, une offre Colissimo livre en « PickupStation »
 * sans jamais réclamer de point de retrait.
 */
export const needsRelay = (offer: ShippingOffer): boolean =>
  offer.mandatory.includes('retrait.pointrelais');

/** « mercredi 13 août », ou rien si le transporteur ne s'engage pas. */
export function formatDeliveryDate(iso: string | null): string | null {
  if (!iso) return null;
  const jour = new Date(iso);
  if (Number.isNaN(jour.getTime())) return null;
  return jour.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * Où le colis arrive, du point de vue de l'acheteur.
 *
 * À distinguer de `needsRelay`, qui dit s'il faudra *choisir* un point : une
 * offre Colissimo livre en « PickupStation » sans en réclamer, relevé sur une
 * vraie cotation. Pour classer à l'écran, c'est la destination qui compte ;
 * pour réserver, c'est ce que l'offre exige.
 */
export const deliversToRelay = (offer: ShippingOffer): boolean =>
  offer.deliveryType === 'PICKUP_POINT' || needsRelay(offer);

/** Le vendeur devra-t-il choisir où déposer ? Cela se règle à l'étiquette. */
export const needsDropoff = (offer: ShippingOffer): boolean =>
  offer.mandatory.includes('depot.pointrelais');

export interface RelayOpeningDay {
  /** 1 = lundi … 7 = dimanche. */
  weekday: number;
  openAm: string | null;
  closeAm: string | null;
  openPm: string | null;
  closePm: string | null;
}

export interface RelayPoint {
  code: string;
  name: string;
  address: string;
  zip: string;
  city: string;
  country: string;
  /** Absentes chez certains transporteurs : la carte se passe alors du point. */
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  hours: RelayOpeningDay[];
}

/**
 * Une fonction Edge en erreur place son message dans le corps de la réponse.
 * Sans cette lecture, « aucun transporteur ne dessert cette adresse » se
 * réduirait à « une erreur est survenue ».
 */
async function edgeBody(error: unknown): Promise<Record<string, any> | null> {
  try {
    return await (error as { context?: Response })?.context?.clone().json();
  } catch {
    return null;
  }
}

async function edgeMessage(error: unknown, fallback: string): Promise<string> {
  const response = (error as { context?: Response })?.context;
  try {
    const body = await response?.clone().json();
    if (typeof body?.error === 'string') return body.error;
  } catch {
    // Corps illisible : on garde le message de repli.
  }
  return fallback;
}

/** Les transporteurs possibles pour cette annonce vers cette adresse. */
export async function fetchOffers(
  listingId: string,
  destination: Pick<DeliveryAddress, 'zip' | 'city' | 'country'>,
): Promise<ShippingOffer[]> {
  const { data, error } = await supabase.functions.invoke('boxtal-quote', {
    body: { listingId, zip: destination.zip, city: destination.city, country: destination.country },
  });
  if (error) throw new Error(await edgeMessage(error, 'Tarifs d’expédition indisponibles.'));
  const payload = data as { offers?: ShippingOffer[]; error?: string };
  if (payload?.error) throw new Error(payload.error);
  return payload.offers ?? [];
}

/**
 * Les points relais desservant une adresse, pour l'offre retenue.
 *
 * Retirer et déposer ne donnent pas la même liste : `pickup` est le point où
 * l'acheteur récupère, `dropoff` celui où le vendeur remet.
 */
export async function fetchRelayPoints(
  offer: Pick<ShippingOffer, 'operatorCode' | 'serviceCode'>,
  destination: { zip: string; city: string; country?: string },
  purpose: 'pickup' | 'dropoff' = 'pickup',
): Promise<RelayPoint[]> {
  const { data, error } = await supabase.functions.invoke('boxtal-points', {
    body: {
      operator: offer.operatorCode,
      service: offer.serviceCode,
      zip: destination.zip,
      city: destination.city,
      country: destination.country ?? 'FR',
      purpose,
    },
  });
  if (error) throw new Error(await edgeMessage(error, 'Points relais indisponibles.'));
  const payload = data as { points?: RelayPoint[]; error?: string };
  if (payload?.error) throw new Error(payload.error);
  return payload.points ?? [];
}

// ---------------------------------------------------------------------------
// Étiquette
// ---------------------------------------------------------------------------

export interface Shipment {
  reference: string;
  operatorLabel: string;
  serviceLabel: string;
  labelUrl: string | null;
  trackingNumber: string | null;
  trackingStatus: string | null;
}

export async function fetchShipment(orderId: string): Promise<Shipment | null> {
  const { data, error } = await supabase
    .from('shipments')
    .select('reference, operator_label, service_label, label_url, tracking_number, tracking_status')
    .eq('order_id', orderId)
    .maybeSingle();
  if (error) fail(error, 'Expédition indisponible.');
  if (!data) return null;
  return {
    reference: data.reference as string,
    operatorLabel: data.operator_label as string,
    serviceLabel: data.service_label as string,
    labelUrl: (data.label_url as string | null) ?? null,
    trackingNumber: (data.tracking_number as string | null) ?? null,
    trackingStatus: (data.tracking_status as string | null) ?? null,
  };
}

/**
 * Achète l'étiquette, ou rend celle déjà achetée. Un vendeur qui appuie deux
 * fois ne doit pas payer deux expéditions — c'est la fonction Edge qui le
 * garantit, pas cet écran.
 */
export interface DropoffNeeded {
  needsDropoff: true;
  operator: string;
  service: string;
  from: { zip: string; city: string; country: string };
}

/** Une façon d'emballer, telle que l'assureur l'accepte. */
export interface PackagingChoice {
  code: string;
  label: string;
  detail: string;
}

export interface PackagingNeeded {
  needsPackaging: true;
  choices: PackagingChoice[];
  insuredValue: Cents;
}

export async function createLabel(
  orderId: string,
  dropoff?: { code: string; label: string },
  packaging?: string,
): Promise<{ reference: string; labelUrl: string | null }> {
  const { data, error } = await supabase.functions.invoke('boxtal-label', {
    body: { orderId, dropoffCode: dropoff?.code, dropoffLabel: dropoff?.label, packaging },
  });
  if (error) {
    // Deux refus ne sont pas des échecs mais des questions : où le vendeur
    // déposera, et comment le colis est emballé. On les remonte telles quelles
    // pour que l'écran les pose.
    const corps = await edgeBody(error);
    if (corps?.needsDropoff || corps?.needsPackaging) {
      throw Object.assign(new Error(corps.error), corps);
    }
    throw new Error(corps?.error ?? 'Édition de l’étiquette impossible.');
  }
  const payload = data as { reference?: string; label_url?: string | null; error?: string };
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.reference) throw new Error('Le transporteur n’a pas confirmé l’expédition.');
  return { reference: payload.reference, labelUrl: payload.label_url ?? null };
}
