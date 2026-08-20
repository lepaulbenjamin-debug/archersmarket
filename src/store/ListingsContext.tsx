import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as favoritesService from '@/services/favorites';
import * as listingsService from '@/services/listings';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/store/AuthContext';
import type { Listing, ListingFilters, ListingStatus, NewListingInput } from '@/types';

/**
 * Une panne d'un instant, qui ne mérite pas d'être annoncée.
 *
 * « JWT issued at future » vient de PostgREST : il compare l'instant d'émission
 * du jeton à sa propre horloge et refuse tout ce qui vient du futur, sans la
 * moindre tolérance. Une seconde de dérive entre le serveur qui frappe le jeton
 * et celui qui le lit suffit — et la tentative suivante passe.
 *
 * Les coupures réseau du premier instant relèvent du même traitement : le
 * téléphone qui sort de veille n'a pas toujours retrouvé sa connexion quand
 * l'application demande ses annonces.
 */
const PASSAGERS = ['issued at future', 'jwt', 'fetch', 'network', 'timeout', 'abort'];

const passager = (err: unknown): boolean => {
  const message = (err as Error)?.message?.toLowerCase() ?? '';
  return PASSAGERS.some((indice) => message.includes(indice));
};

interface ListingsValue {
  listings: Listing[];
  loading: boolean;
  error: string | null;
  favorites: string[];
  refresh: () => Promise<void>;
  listingById: (id: string) => Listing | undefined;
  search: (filters: ListingFilters) => Listing[];
  listingsBySeller: (sellerId: string) => Listing[];
  favoriteListings: Listing[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => Promise<void>;
  createListing: (input: NewListingInput) => Promise<Listing>;
  setStatus: (id: string, status: ListingStatus, buyerId?: string | null) => Promise<void>;
  removeListing: (id: string) => Promise<void>;
  registerView: (id: string) => Promise<void>;
}

const ListingsContext = createContext<ListingsValue | null>(null);

export function ListingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Recharge les annonces, avec une seconde tentative en cas d'échec passager.
   *
   * Le cas visé est « JWT issued at future » : PostgREST refuse un jeton dont
   * l'instant d'émission dépasse sa propre horloge, sans la moindre tolérance.
   * Une seconde de dérive entre le serveur qui frappe le jeton et celui qui le
   * lit suffit à faire échouer le premier chargement — et l'archer qui ouvre
   * l'application voit un bandeau rouge annonçant une panne, pour un incident
   * qui aura disparu avant qu'il ait fini de le lire.
   *
   * On rafraîchit donc la session et on retente une fois. Une seule : au-delà,
   * c'est une vraie panne, et la masquer par des tentatives en série
   * n'apporterait qu'un écran figé.
   */
  const refresh = useCallback(async () => {
    try {
      setListings(await listingsService.fetchListings());
      setError(null);
      return;
    } catch (err) {
      if (!passager(err)) {
        setError((err as Error).message);
        return;
      }
    }

    try {
      await supabase.auth.refreshSession();
    } catch {
      // Sans session valide, la lecture publique des annonces reste possible :
      // ce n'est pas une raison de renoncer à la seconde tentative.
    }

    try {
      setListings(await listingsService.fetchListings());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
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
      setFavorites(await favoritesService.fetchFavorites(user.id).catch(() => []));
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
      const wasFavorite = favorites.includes(id);
      // Bascule optimiste : l'annulation remet l'état d'origine.
      setFavorites((prev) => (wasFavorite ? prev.filter((f) => f !== id) : [id, ...prev]));
      try {
        if (wasFavorite) await favoritesService.removeFavorite(user.id, id);
        else await favoritesService.addFavorite(user.id, id);
      } catch {
        setFavorites((prev) => (wasFavorite ? [id, ...prev] : prev.filter((f) => f !== id)));
      }
    },
    [favorites, user],
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

  const setStatus = useCallback(
    async (id: string, status: ListingStatus, buyerId?: string | null) => {
    const updated = await listingsService.updateListingStatus(id, status, buyerId);
    setListings((prev) => prev.map((l) => (l.id === id ? updated : l)));
    },
    [],
  );

  const removeListing = useCallback(async (id: string) => {
    await listingsService.deleteListing(id);
    setListings((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const registerView = useCallback(async (id: string) => {
    await listingsService.incrementViews(id);
    setListings((prev) => prev.map((l) => (l.id === id ? { ...l, views: l.views + 1 } : l)));
  }, []);

  const value = useMemo<ListingsValue>(
    () => ({
      listings,
      loading,
      error,
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
      error,
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
