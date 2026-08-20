import { useRouter } from 'expo-router';
import React from 'react';

import { Button } from '@/components/Button';

/**
 * Achat protégé d'une annonce.
 *
 * Le bouton n'achète rien lui-même : il ouvre l'écran de livraison, où
 * l'acheteur choisit comment il veut être livré avant de payer. Les montants
 * restent décidés par la fonction Edge, jamais ici.
 */
export function BuyButton({
  listingId,
  disabled,
  style,
}: {
  listingId: string;
  disabled?: boolean;
  style?: React.ComponentProps<typeof Button>['style'];
}) {
  const router = useRouter();

  return (
    <Button
      label="Acheter"
      icon="shield-check-outline"
      onPress={() => router.push(`/checkout/${listingId}`)}
      disabled={disabled}
      style={style}
    />
  );
}
