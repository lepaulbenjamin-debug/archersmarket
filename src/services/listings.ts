import { LISTING_SELECT, toListing, type ListingRow } from '@/services/mappers';
import { uploadListingPhoto } from '@/services/photos';
import { fail, supabase } from '@/services/supabase';
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

export async function updateListingStatus(
  listingId: string,
  status: ListingStatus,
): Promise<Listing> {
  const { data, error } = await supabase
    .from('listings')
    .update({ status })
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
