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

export interface SellerAddress {
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
    .select('full_name, address, zip, city, country, phone')
    .maybeSingle();
  if (error) fail(error, 'Adresse d’expédition indisponible.');
  if (!data) return null;
  return {
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
  priceCents: Cents;
  collectionType: string;
  deliveryType: string;
  deliveryLabel: string;
  mandatory: string[];
}

/** L'offre livre-t-elle en point relais ? Il faudra alors en choisir un. */
export const needsRelay = (offer: ShippingOffer): boolean =>
  offer.deliveryType === 'PICKUP_POINT' || offer.mandatory.includes('retrait.pointrelais');

export interface RelayPoint {
  code: string;
  name: string;
  address: string;
  zip: string;
  city: string;
  country: string;
}

/**
 * Une fonction Edge en erreur place son message dans le corps de la réponse.
 * Sans cette lecture, « aucun transporteur ne dessert cette adresse » se
 * réduirait à « une erreur est survenue ».
 */
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

/** Les points relais desservant l'adresse, pour le transporteur retenu. */
export async function fetchRelayPoints(
  operator: string,
  destination: Pick<DeliveryAddress, 'zip' | 'city' | 'country'>,
): Promise<RelayPoint[]> {
  const { data, error } = await supabase.functions.invoke('boxtal-points', {
    body: { operator, zip: destination.zip, city: destination.city, country: destination.country },
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
export async function createLabel(orderId: string): Promise<{ reference: string; labelUrl: string | null }> {
  const { data, error } = await supabase.functions.invoke('boxtal-label', { body: { orderId } });
  if (error) throw new Error(await edgeMessage(error, 'Édition de l’étiquette impossible.'));
  const payload = data as { reference?: string; label_url?: string | null; error?: string };
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.reference) throw new Error('Le transporteur n’a pas confirmé l’expédition.');
  return { reference: payload.reference, labelUrl: payload.label_url ?? null };
}
