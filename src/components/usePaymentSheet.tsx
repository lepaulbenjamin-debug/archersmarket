import { useStripe } from '@stripe/stripe-react-native';
import React, { useCallback } from 'react';
import { Alert } from 'react-native';

import { colors } from '@/theme';

/** Ce qu'il est advenu d'une tentative de paiement. */
export type PaymentOutcome = 'paid' | 'cancelled' | 'interrupted';

export interface PaymentRequest {
  clientSecret: string;
  orderId: string;
}

/**
 * Confirmer un paiement, sur téléphone : la feuille de paiement native de
 * Stripe.
 *
 * L'écran de commande ne connaît que `pay` et `sheet`. Sur le site, la même
 * interface ouvre le Payment Element de Stripe.js (`usePaymentSheet.web.tsx`) ;
 * ici, la feuille est dessinée par le SDK et `sheet` ne contient rien.
 */
export function usePaymentSheet(): {
  pay: (request: PaymentRequest) => Promise<PaymentOutcome>;
  sheet: React.ReactNode;
} {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const pay = useCallback(
    async ({ clientSecret }: PaymentRequest): Promise<PaymentOutcome> => {
      const { error: init } = await initPaymentSheet({
        merchantDisplayName: 'Archers Market',
        paymentIntentClientSecret: clientSecret,
        allowsDelayedPaymentMethods: false,
        returnURL: 'archersmarket://commande',
        appearance: {
          colors: { primary: colors.primary },
          primaryButton: {
            // Nos propres boutons sont des pilules, obtenues avec un rayon de
            // 999. Ici, ce chiffre fait purement et simplement disparaître le
            // bouton de paiement — le rayon est appliqué tel quel par le SDK,
            // et un rayon plus grand que la moitié de la hauteur dégénère.
            // 26 vaut la moitié de la hauteur du bouton : même arrondi, mais
            // le bouton existe.
            shapes: { borderRadius: 26 },
            // Explicites plutôt que déduites : un bouton invisible est déjà
            // arrivé une fois, on ne laisse plus la couleur au hasard.
            colors: { background: colors.primary, text: colors.onPrimary },
          },
        },
      });
      if (init) throw new Error(init.message);

      const { error: payment } = await presentPaymentSheet();
      if (payment) {
        // Un abandon n'est pas un incident : la commande reste en attente.
        if (payment.code === 'Canceled') return 'cancelled';
        Alert.alert('Paiement interrompu', payment.message);
        return 'interrupted';
      }
      return 'paid';
    },
    [initPaymentSheet, presentPaymentSheet],
  );

  return { pay, sheet: null };
}
