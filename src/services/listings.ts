import { LISTING_SELECT, publicPhotoUrl, toListing, type ListingRow } from '@/services/mappers';
import { uploadListingPhoto } from '@/services/photos';
import { LISTING_PHOTOS_BUCKET, fail, supabase } from '@/services/supabase';
import type { Listing, ListingFilters, ListingStatus, NewListingInput } from '@/types';

const matchesQuery = (listing: Listing, query: string) => {
  const haystack = [listing.title, listing.description, listing.brand, listing.city]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
};

/**
 * Filtrage et tri côté client : le fil est chargé en une fois, ce qui rend les
 * filtres instantanés. À fort volume, basculer ces critères dans la requête.
 */
export function applyFilters(listings: Listing[], filters: ListingFilters): Listing[] {
  const {
    query,
    categories,
    conditions,
    brands,
    handedness,
    minPrice,
    maxPrice,
    minDrawWeight,
    maxDrawWeight,
    shippingOnly,
    sort = 'recent',
  } = filters;

  const result = listings.filter((listing) => {
    if (listing.status === 'sold' || listing.status === 'draft') return false;
    if (query && !matchesQuery(listing, query)) return false;
    if (categories?.length && !categories.includes(listing.category)) return false;
    if (conditions?.length && !conditions.includes(listing.condition)) return false;
    if (brands?.length && !brands.includes(listing.brand)) return false;
    if (handedness && handedness !== 'na') {
      if (listing.handedness !== 'na' && listing.handedness !== handedness) return false;
    }
    if (minPrice != null && listing.price < minPrice) return false;
    if (maxPrice != null && listing.price > maxPrice) return false;
    if (minDrawWeight != null && (listing.drawWeight ?? -Infinity) < minDrawWeight) return false;
    if (maxDrawWeight != null && (listing.drawWeight ?? Infinity) > maxDrawWeight) return false;
    if (shippingOnly && !listing.shipping) return false;
    return true;
  });

  const sorted = [...result];
  switch (sort) {
    case 'price-asc':
      sorted.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      sorted.sort((a, b) => b.price - a.price);
      break;
    case 'popular':
      sorted.sort((a, b) => b.views - a.views);
      break;
    default:
      sorted.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
  return sorted;
}

export async function fetchListings(): Promise<Listing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_SELECT)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) fail(error, 'Chargement des annonces impossible.');
  return (data as ListingRow[]).map(toListing);
}

export async function createListing(
  input: NewListingInput,
  sellerId: string,
): Promise<Listing> {
  const { photos = [], ...fields } = input;

  const { data, error } = await supabase
    .from('listings')
    .insert({
      seller_id: sellerId,
      title: fields.title,
      description: fields.description,
      price: fields.price,
      category: fields.category,
      brand: fields.brand,
      condition: fields.condition,
      hand: fields.handedness,
      draw_weight: fields.drawWeight ?? null,
      bow_length: fields.bowLength ?? null,
      draw_length: fields.drawLength ?? null,
      spine: fields.spine ?? null,
      size: fields.size ?? null,
      city: fields.city,
      shipping: fields.shipping,
      shipping_price: fields.shippingPrice ?? null,
      parcel_size: fields.parcelSize ?? null,
    })
    .select(LISTING_SELECT)
    .single();
  if (error || !data) fail(error, 'Publication de l’annonce impossible.');

  const listing = data as ListingRow;

  if (photos.length) {
    const paths = await Promise.all(
      photos.map((uri, index) => uploadListingPhoto(uri, sellerId, listing.id, index)),
    );
    const { error: imagesError } = await supabase.from('listing_images').insert(
      paths.map((path, position) => ({ listing_id: listing.id, path, position })),
    );
    if (imagesError) fail(imagesError, 'Enregistrement des photos impossible.');
    listing.listing_images = paths.map((path, position) => ({ path, position }));
  }

  return toListing(listing);
}

/**
 * Modifie une annonce publiée.
 *
 * Le statut n'est jamais envoyé, et ce n'est pas un oubli : le déclencheur
 * `listings_notify_wanted` porte sur `update of status`, et Postgres le
 * déclenche dès que la colonne figure dans la requête — même réécrite à
 * l'identique. L'inclure préviendrait les chercheurs à chaque correction de
 * faute de frappe.
 */
export async function updateListing(
  listingId: string,
  input: NewListingInput,
  sellerId: string,
): Promise<Listing> {
  const { photos = [], ...fields } = input;

  const { error } = await supabase
    .from('listings')
    .update({
      title: fields.title,
      description: fields.description,
      price: fields.price,
      category: fields.category,
      brand: fields.brand,
      condition: fields.condition,
      hand: fields.handedness,
      draw_weight: fields.drawWeight ?? null,
      bow_length: fields.bowLength ?? null,
      draw_length: fields.drawLength ?? null,
      spine: fields.spine ?? null,
      size: fields.size ?? null,
      city: fields.city,
      shipping: fields.shipping,
      shipping_price: fields.shippingPrice ?? null,
      parcel_size: fields.parcelSize ?? null,
    })
    .eq('id', listingId);
  if (error) fail(error, 'Enregistrement de l’annonce impossible.');

  await reconcilePhotos(listingId, sellerId, photos);

  const { data, error: relecture } = await supabase
    .from('listings')
    .select(LISTING_SELECT)
    .eq('id', listingId)
    .single();
  if (relecture || !data) fail(relecture, 'Relecture de l’annonce impossible.');
  return toListing(data as ListingRow);
}

/**
 * Aligne les photos stockées sur celles que le vendeur a laissées.
 *
 * Le formulaire rend un mélange : des URL publiques pour les photos déjà en
 * ligne, des URI locales pour celles qu'on vient d'ajouter. On retrouve le
 * chemin de stockage des premières, on envoie les secondes, puis on réécrit
 * l'ordre — et on efface du stockage ce que plus aucune ligne ne référence,
 * faute de quoi chaque modification laisserait un fichier derrière elle.
 */
async function reconcilePhotos(
  listingId: string,
  sellerId: string,
  photos: string[],
): Promise<void> {
  const { data: existantes, error } = await supabase
    .from('listing_images')
    .select('path, position')
    .eq('listing_id', listingId);
  if (error) fail(error, 'Lecture des photos impossible.');

  const parUrl = new Map<string, string>();
  for (const { path } of (existantes ?? []) as Array<{ path: string }>) {
    parUrl.set(publicPhotoUrl(path), path);
  }

  // Un nom de fichier neuf par envoi : réutiliser l'index écraserait une photo
  // conservée qui porte déjà ce numéro.
  const horodatage = Date.now();
  const chemins: string[] = [];
  for (const [index, photo] of photos.entries()) {
    const connue = parUrl.get(photo);
    chemins.push(
      connue ?? (await uploadListingPhoto(photo, sellerId, listingId, horodatage + index)),
    );
  }

  const { error: purge } = await supabase
    .from('listing_images')
    .delete()
    .eq('listing_id', listingId);
  if (purge) fail(purge, 'Mise à jour des photos impossible.');

  if (chemins.length) {
    const { error: insertion } = await supabase
      .from('listing_images')
      .insert(chemins.map((path, position) => ({ listing_id: listingId, path, position })));
    if (insertion) fail(insertion, 'Enregistrement des photos impossible.');
  }

  const orphelines = [...parUrl.values()].filter((path) => !chemins.includes(path));
  if (orphelines.length) {
    // Un fichier oublié dans le stockage ne casse rien : on ne fait pas échouer
    // une modification réussie pour ça.
    await supabase.storage.from(LISTING_PHOTOS_BUCKET).remove(orphelines);
  }
}

export async function updateListingStatus(
  listingId: string,
  status: ListingStatus,
  buyerId?: string | null,
): Promise<Listing> {
  const { data, error } = await supabase
    .from('listings')
    .update(buyerId === undefined ? { status } : { status, buyer_id: buyerId })
    .eq('id', listingId)
    .select(LISTING_SELECT)
    .single();
  if (error || !data) fail(error, 'Mise à jour de l’annonce impossible.');
  return toListing(data as ListingRow);
}

export async function deleteListing(listingId: string): Promise<void> {
  const { error } = await supabase.from('listings').delete().eq('id', listingId);
  if (error) fail(error, 'Suppression de l’annonce impossible.');
}

export async function incrementViews(listingId: string): Promise<void> {
  // Fonction SECURITY DEFINER : incrémente sans ouvrir l'annonce en écriture.
  await supabase.rpc('increment_listing_views', { target: listingId });
}
