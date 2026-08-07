import { useStripe } from '@stripe/stripe-react-native';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert } from 'react-native';

import { Button } from '@/components/Button';
import { createCheckout } from '@/services/payments';

/**
 * Achat protégé d'une annonce.
 *
 * Le montant n'est pas décidé ici : la fonction Edge le recalcule et renvoie
 * un paiement déjà chiffré. L'app se contente de présenter la feuille de
 * paiement de Stripe, où les coordonnées bancaires ne transitent jamais par
 * nous.
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
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [loading, setLoading] = useState(false);

  const buy = async () => {
    setLoading(true);
    try {
      const { orderId, clientSecret } = await createCheckout(listingId);

      const { error: init } = await initPaymentSheet({
        merchantDisplayName: 'Archers Market',
        paymentIntentClientSecret: clientSecret,
        allowsDelayedPaymentMethods: false,
        returnURL: 'archersmarket://commande',
        appearance: {
          colors: { primary: '#F5843C' },
          primaryButton: { shapes: { borderRadius: 999 } },
        },
      });
      if (init) throw new Error(init.message);

      const { error: payment } = await presentPaymentSheet();
      if (payment) {
        // Un abandon n'est pas un incident : la commande reste en attente et
        // sera reprise telle quelle au prochain essai.
        if (payment.code !== 'Canceled') Alert.alert('Paiement interrompu', payment.message);
        return;
      }

      // L'écran de commande lit l'état confirmé par Stripe, pas la réponse
      // reçue ici : c'est le webhook qui fait foi.
      router.push(`/order/${orderId}`);
    } catch (error) {
      Alert.alert('Achat impossible', (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      label="Acheter"
      icon="shield-check-outline"
      onPress={buy}
      loading={loading}
      disabled={disabled}
      style={style}
    />
  );
}
