import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';

import { EmptyState } from '@/components/EmptyState';
import { ListingForm } from '@/components/ListingForm';
import { Header, Screen } from '@/components/Screen';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';

/**
 * Modifier une annonce publiée.
 *
 * Trois refus, et ils sont tous rendus à l'identique côté base : l'application
 * dit pourquoi, la base fait foi.
 */
export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { listingById } = useListings();

  const listing = id ? listingById(id) : undefined;

  const refus = !listing
    ? {
        icon: 'file-search-outline' as const,
        title: 'Annonce introuvable',
        description: 'Elle a peut-être été supprimée.',
      }
    : listing.sellerId !== user?.id
      ? {
          icon: 'lock-outline' as const,
          title: 'Ce n’est pas votre annonce',
          description: 'Seul le vendeur peut modifier une annonce.',
        }
      : listing.status === 'sold'
        ? {
            icon: 'check-decagram-outline' as const,
            title: 'Cette annonce est vendue',
            description:
              'Son contenu ne peut plus changer : l’acheteur a acheté ce qui y était décrit. Vous pouvez la remettre en ligne depuis « Gérer l’annonce », puis la modifier.',
          }
        : null;

  if (refus || !listing) {
    return (
      <Screen>
        <Header title="Modifier l’annonce" showBack />
        <EmptyState
          icon={refus?.icon ?? 'file-search-outline'}
          title={refus?.title ?? 'Annonce introuvable'}
          description={refus?.description ?? ''}
          actionLabel="Retour"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Modifier l’annonce" subtitle={listing.title} showBack />
      {/* Enregistré, on revient à l'annonce : c'est là qu'on vérifie son travail. */}
      <ListingForm listing={listing} onDone={() => router.back()} />
    </Screen>
  );
}
