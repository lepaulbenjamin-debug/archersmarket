import { useRouter } from 'expo-router';
import React from 'react';

import { EmptyState } from '@/components/EmptyState';
import { ListingForm } from '@/components/ListingForm';
import { Header, Screen } from '@/components/Screen';
import { useAuth } from '@/store/AuthContext';

/**
 * Publier une annonce.
 *
 * Le formulaire vit dans `ListingForm`, parce que modifier une annonce pose
 * exactement les mêmes questions que la publier. Deux copies auraient divergé
 * dès le premier champ ajouté d'un seul côté.
 */
export default function SellScreen() {
  const router = useRouter();
  const { user } = useAuth();

  if (!user) {
    return (
      <Screen>
        <Header title="Publier" />
        <EmptyState
          icon="account-lock-outline"
          title="Connectez-vous pour publier"
          description="Créez un compte gratuit pour publier vos annonces et échanger avec les acheteurs."
          actionLabel="Se connecter"
          onAction={() => router.push('/login')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Publier une annonce" subtitle="Gratuit et sans commission" />
      <ListingForm onDone={(listing) => router.push(`/listing/${listing.id}`)} />
    </Screen>
  );
}
