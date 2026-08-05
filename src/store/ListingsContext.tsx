import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as favoritesService from '@/services/favorites';
import * as listingsService from '@/services/listings';
import { useAuth } from '@/store/AuthContext';
import type { Listing, ListingFilters, ListingStatus, NewListingInput } from '@/types';

interface ListingsValue {
  listings: Listing[];
  loading: boolean;
  favorites: string[];
  refresh: () => Promise<void>;
  listingById: (id: string) => Listing | undefined;
  search: (filters: ListingFilters) => Listing[];
  listingsBySeller: (sellerId: string) => Listing[];
  favoriteListings: Listing[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => Promise<void>;
  createListing: (input: NewListingInput) => Promise<Listing>;
  setStatus: (id: string, status: ListingStatus) => Promise<void>;
  removeListing: (id: string) => Promise<void>;
  registerView: (id: string) => Promise<void>;
}

const ListingsContext = createContext<ListingsValue | null>(null);

export function ListingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setListings(await listingsService.fetchListings());
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  useEffect(() => {
    (async () => {
      if (!user) {
        setFavorites([]);
        return;
      }
      setFavorites(await favoritesService.fetchFavorites(user.id));
    })();
  }, [user]);

  const listingById = useCallback((id: string) => listings.find((l) => l.id === id), [listings]);

  const search = useCallback(
    (filters: ListingFilters) => listingsService.applyFilters(listings, filters),
    [listings],
  );

  const listingsBySeller = useCallback(
    (sellerId: string) => listings.filter((l) => l.sellerId === sellerId),
    [listings],
  );

  const favoriteListings = useMemo(
    () => favorites.map((id) => listings.find((l) => l.id === id)).filter((l): l is Listing => !!l),
    [favorites, listings],
  );

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites]);

  const toggleFavorite = useCallback(
    async (id: string) => {
      if (!user) return;
      setFavorites(await favoritesService.toggleFavorite(user.id, id));
    },
    [user],
  );

  const createListing = useCallback(
    async (input: NewListingInput) => {
      if (!user) throw new Error('Connectez-vous pour publier une annonce.');
      const listing = await listingsService.createListing(input, user.id);
      setListings((prev) => [listing, ...prev]);
      return listing;
    },
    [user],
  );

  const setStatus = useCallback(async (id: string, status: ListingStatus) => {
    setListings(await listingsService.updateListingStatus(id, status));
  }, []);

  const removeListing = useCallback(async (id: string) => {
    setListings(await listingsService.deleteListing(id));
  }, []);

  const registerView = useCallback(async (id: string) => {
    await listingsService.incrementViews(id);
    setListings((prev) => prev.map((l) => (l.id === id ? { ...l, views: l.views + 1 } : l)));
  }, []);

  const value = useMemo<ListingsValue>(
    () => ({
      listings,
      loading,
      favorites,
      refresh,
      listingById,
      search,
      listingsBySeller,
      favoriteListings,
      isFavorite,
      toggleFavorite,
      createListing,
      setStatus,
      removeListing,
      registerView,
    }),
    [
      createListing,
      favoriteListings,
      favorites,
      isFavorite,
      listingById,
      listings,
      listingsBySeller,
      loading,
      refresh,
      registerView,
      removeListing,
      search,
      setStatus,
      toggleFavorite,
    ],
  );

  return <ListingsContext.Provider value={value}>{children}</ListingsContext.Provider>;
}

export function useListings(): ListingsValue {
  const ctx = useContext(ListingsContext);
  if (!ctx) throw new Error('useListings doit être utilisé dans ListingsProvider.');
  return ctx;
}
