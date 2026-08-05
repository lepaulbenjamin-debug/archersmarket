import { db, delay, makeId } from '@/services/db';
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
    if (listing.status === 'sold') return false;
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
  await delay();
  const listings = await db.listings();
  return [...listings].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function createListing(input: NewListingInput, sellerId: string): Promise<Listing> {
  await delay(260);
  const listings = await db.listings();
  const listing: Listing = {
    ...input,
    id: makeId('l'),
    sellerId,
    images: input.images?.length ? input.images : [input.category],
    status: 'active',
    createdAt: new Date().toISOString(),
    views: 0,
  };
  await db.saveListings([listing, ...listings]);
  return listing;
}

export async function updateListingStatus(
  listingId: string,
  status: ListingStatus,
): Promise<Listing[]> {
  const listings = await db.listings();
  const next = listings.map((l) => (l.id === listingId ? { ...l, status } : l));
  await db.saveListings(next);
  return next;
}

export async function deleteListing(listingId: string): Promise<Listing[]> {
  const listings = await db.listings();
  const next = listings.filter((l) => l.id !== listingId);
  await db.saveListings(next);
  return next;
}

export async function incrementViews(listingId: string): Promise<void> {
  const listings = await db.listings();
  await db.saveListings(
    listings.map((l) => (l.id === listingId ? { ...l, views: l.views + 1 } : l)),
  );
}
