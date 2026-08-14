import { fail, supabase } from '@/services/supabase';
import type { Cents } from '@/services/payments';

/**
 * Le convoyage entre archers.
 *
 * Beaucoup d'archers roulent déjà — compétitions, stages, sorties de club — et
 * un arc de 130 cm voyage souvent mieux dans un coffre que dans un réseau de
 * messagerie, quand celui-ci l'accepte.
 *
 * Ce que le convoyeur reçoit est une *participation aux frais*, plafonnée :
 * transporter des marchandises pour autrui contre rémunération est une
 * activité réglementée, et c'est le montage du covoiturage qui rend celle-ci
 * possible. Les plafonds ne sont donc pas des réglages d'affichage.
 */

/** Participation maximale, en centimes. Au-delà, ce n'est plus du partage. */
export const MAX_CONTRIBUTION: Cents = 2500;

export type ParcelSize = 'small' | 'medium' | 'long' | 'xl';

/** Ce qu'un coffre accepte, du plus petit au plus encombrant. */
export const COFFRES: Array<{ value: ParcelSize; label: string; detail: string }> = [
  { value: 'medium', label: 'Un colis ordinaire', detail: 'Jusqu’à 60 cm — viseur, stabilisateur' },
  { value: 'long', label: 'Un arc démonté', detail: 'Jusqu’à 90 cm — housse souple' },
  { value: 'xl', label: 'Un arc en valise', detail: 'Jusqu’à 130 cm — valise rigide' },
];

export interface Trip {
  id: string;
  carrierId: string;
  fromZip: string;
  fromCity: string;
  toZip: string;
  toCity: string;
  departOn: string;
  note?: string;
  maxParcel: ParcelSize;
  contribution: Cents;
  status: 'open' | 'closed' | 'cancelled';
  createdAt: string;
}

interface TripRow {
  id: string;
  carrier_id: string;
  from_zip: string;
  from_city: string;
  to_zip: string;
  to_city: string;
  depart_on: string;
  note: string | null;
  max_parcel: ParcelSize;
  contribution: number;
  status: 'open' | 'closed' | 'cancelled';
  created_at: string;
}

const toTrip = (row: TripRow): Trip => ({
  id: row.id,
  carrierId: row.carrier_id,
  fromZip: row.from_zip,
  fromCity: row.from_city,
  toZip: row.to_zip,
  toCity: row.to_city,
  departOn: row.depart_on,
  note: row.note ?? undefined,
  maxParcel: row.max_parcel,
  contribution: row.contribution,
  status: row.status,
  createdAt: row.created_at,
});

const TRIP_SELECT =
  'id, carrier_id, from_zip, from_city, to_zip, to_city, depart_on, note, max_parcel, contribution, status, created_at';

export interface TripDraft {
  fromZip: string;
  fromCity: string;
  toZip: string;
  toCity: string;
  departOn: string;
  note?: string;
  maxParcel: ParcelSize;
  contribution: Cents;
}

/** Déclare un trajet. Le compte doit être vérifié — la base le refusera sinon. */
export async function createTrip(draft: TripDraft): Promise<Trip> {
  const { data: session } = await supabase.auth.getUser();
  const carrierId = session.user?.id;
  if (!carrierId) throw new Error('Connexion requise.');

  const { data, error } = await supabase
    .from('archer_trips')
    .insert({
      carrier_id: carrierId,
      from_zip: draft.fromZip,
      from_city: draft.fromCity,
      to_zip: draft.toZip,
      to_city: draft.toCity,
      depart_on: draft.departOn,
      note: draft.note?.trim() || null,
      max_parcel: draft.maxParcel,
      contribution: draft.contribution,
    })
    .select(TRIP_SELECT)
    .single();

  if (error) fail(error, 'Trajet non enregistré.');
  return toTrip(data as TripRow);
}

/** Mes trajets, le prochain départ en tête. */
export async function myTrips(): Promise<Trip[]> {
  const { data: session } = await supabase.auth.getUser();
  const carrierId = session.user?.id;
  if (!carrierId) return [];

  const { data, error } = await supabase
    .from('archer_trips')
    .select(TRIP_SELECT)
    .eq('carrier_id', carrierId)
    .order('depart_on', { ascending: false });

  if (error) fail(error, 'Chargement des trajets impossible.');
  return (data as TripRow[]).map(toTrip);
}

/**
 * Retire un trajet de la liste. La base refuse si un colis y est déjà
 * rattaché : le vendeur a peut-être remis l'arc.
 */
export async function cancelTrip(id: string): Promise<void> {
  const { error } = await supabase
    .from('archer_trips')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) fail(error, 'Annulation impossible.');
}

// ---------------------------------------------------------------------------
// Trouver un convoyeur, à l'achat
// ---------------------------------------------------------------------------

export interface TripOffer extends Omit<Trip, 'status' | 'createdAt'> {
  carrierName: string;
  /** Combien de colis ce trajet porte déjà. Un coffre a une fin. */
  parcelsTaken: number;
}

/**
 * Les trajets qui peuvent porter cette annonce jusqu'à ce code postal.
 *
 * La recherche se fait en base : le point de départ est l'adresse
 * d'expédition du vendeur, que l'acheteur n'a pas à connaître.
 */
export async function tripsForListing(listingId: string, zip: string): Promise<TripOffer[]> {
  const { data, error } = await supabase.rpc('trips_for_listing', {
    listing_id: listingId,
    dest_zip: zip,
  });
  if (error) fail(error, 'Recherche de convoyeurs impossible.');

  return ((data ?? []) as Array<TripRow & { carrier_name: string; parcels_taken: number }>).map(
    (row) => ({
      id: row.id,
      carrierId: row.carrier_id,
      carrierName: row.carrier_name,
      fromZip: row.from_zip,
      fromCity: row.from_city,
      toZip: row.to_zip,
      toCity: row.to_city,
      departOn: row.depart_on,
      note: row.note ?? undefined,
      maxParcel: row.max_parcel,
      contribution: row.contribution,
      parcelsTaken: Number(row.parcels_taken ?? 0),
    }),
  );
}

/**
 * La valeur maximale qu'un archer peut convoyer en ce moment.
 *
 * Elle bouge : elle dépend de ce que la caisse de garantie peut encore
 * couvrir, colis déjà en route déduits.
 */
export async function archerValueCap(): Promise<Cents> {
  const { data, error } = await supabase.rpc('archer_value_cap');
  if (error) fail(error, 'Plafond indisponible.');
  return Number(data);
}

// ---------------------------------------------------------------------------
// Porter un colis
// ---------------------------------------------------------------------------

export interface Mission {
  orderId: string;
  listingTitle: string;
  status: 'paid' | 'shipped' | 'delivered' | 'released';
  pickedUpAt?: string;
  contribution: Cents;
  departOn?: string;
  sellerName: string;
  from: Adresse;
  to: Adresse;
}

export interface Adresse {
  civility: string;
  name: string;
  address: string;
  zip: string;
  city: string;
  phone?: string;
}

/** Les colis qui me sont confiés, avec les deux adresses et rien d'autre. */
export async function carrierMissions(): Promise<Mission[]> {
  const { data, error } = await supabase.rpc('carrier_missions');
  if (error) fail(error, 'Chargement des convoyages impossible.');

  return ((data ?? []) as Array<Record<string, string | number | null>>).map((row) => ({
    orderId: String(row.order_id),
    listingTitle: String(row.listing_title),
    status: row.status as Mission['status'],
    pickedUpAt: (row.picked_up_at as string) ?? undefined,
    contribution: Number(row.contribution ?? 0),
    departOn: (row.depart_on as string) ?? undefined,
    sellerName: String(row.seller_name ?? 'Vendeur'),
    from: {
      civility: String(row.from_civility ?? 'M'),
      name: String(row.from_name ?? ''),
      address: String(row.from_address ?? ''),
      zip: String(row.from_zip ?? ''),
      city: String(row.from_city ?? ''),
      phone: (row.from_phone as string) ?? undefined,
    },
    to: {
      civility: String(row.to_civility ?? 'M'),
      name: String(row.to_name ?? ''),
      address: String(row.to_address ?? ''),
      zip: String(row.to_zip ?? ''),
      city: String(row.to_city ?? ''),
      phone: (row.to_phone as string) ?? undefined,
    },
  }));
}

/** Le code que le vendeur remet au convoyeur au départ. Vendeur seul. */
export async function fetchPickupCode(orderId: string): Promise<string> {
  const { data, error } = await supabase.rpc('pickup_code', { order_id: orderId });
  if (error) fail(error, 'Code de départ indisponible.');
  return String(data);
}

/** Le convoyeur prend le colis, sur le code du vendeur. */
export async function confirmPickup(orderId: string, code: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_pickup', { order_id: orderId, code });
  if (error) fail(error, 'Code incorrect.');
}

/** Le convoyeur remet le colis, sur le code de l'acheteur. */
export async function confirmDelivery(orderId: string, code: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_delivery', { order_id: orderId, code });
  if (error) fail(error, 'Code incorrect.');
}

/**
 * Combien d'archers partent du secteur de cette annonce dans le mois.
 *
 * Ce n'est pas une promesse de correspondance : l'acheteur n'a encore donné
 * aucune adresse, donc on ignore où il est. Le nombre dit qu'il y a du
 * mouvement au départ, rien de plus, et l'écran doit le dire ainsi.
 *
 * Un échec ne rend pas d'erreur : ce compteur est un agrément, pas un
 * renseignement dont dépend un achat.
 */
export async function tripsFromArea(listingId: string): Promise<number> {
  const { data, error } = await supabase.rpc('trips_from_listing_area', { listing_id: listingId });
  if (error) return 0;
  return Number(data ?? 0);
}

export interface ConvoyageDemand {
  /** Les codes postaux d'où l'on sait que ce membre part. */
  zips: string[];
  /** Annonces à portée de l'un d'eux, les siennes exclues. */
  listings: number;
  /** Le rayon retenu, en kilomètres. Décidé en base, affiché tel quel. */
  radiusKm: number;
}

/** Ce qu'un convoyeur a à gagner à déclarer un trajet. */
export async function convoyageDemand(): Promise<ConvoyageDemand> {
  const vide = { zips: [], listings: 0, radiusKm: 0 };
  const { data, error } = await supabase.rpc('convoyage_demand');
  if (error) return vide;
  const brut = (data ?? {}) as { zips?: unknown; listings?: unknown; radius_km?: unknown };
  return {
    zips: Array.isArray(brut.zips) ? brut.zips.map(String) : [],
    listings: Number(brut.listings ?? 0),
    radiusKm: Number(brut.radius_km ?? 0),
  };
}

/** « mercredi 13 août », pour une date de départ. */
export function formatDepart(iso: string): string {
  const jour = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(jour.getTime())) return iso;
  return jour.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
