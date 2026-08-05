import { useRouter } from 'expo-router';
import React from 'react';

import { EmptyState } from '@/components/EmptyState';
import { ListingGrid } from '@/components/ListingGrid';
import { Header, Screen } from '@/components/Screen';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';

export default function FavoritesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { favoriteListings, isFavorite, toggleFavorite } = useListings();

  return (
    <Screen>
      <Header
        title="Favoris"
        subtitle={user ? `${favoriteListings.length} annonce(s) enregistrée(s)` : undefined}
      />
      {!user ? (
        <EmptyState
          icon="heart-off-outline"
          title="Connectez-vous pour enregistrer vos coups de cœur"
          description="Vos favoris sont liés à votre compte et vous suivent partout."
          actionLabel="Se connecter"
          onAction={() => router.push('/login')}
        />
      ) : (
        <ListingGrid
          listings={favoriteListings}
          isFavorite={isFavorite}
          onToggleFavorite={toggleFavorite}
          empty={
            <EmptyState
              icon="heart-outline"
              title="Aucun favori pour l’instant"
              description="Touchez le cœur sur une annonce pour la garder sous la main."
              actionLabel="Explorer les annonces"
              onAction={() => router.push('/(tabs)')}
            />
          }
        />
      )}
    </Screen>
  );
}
