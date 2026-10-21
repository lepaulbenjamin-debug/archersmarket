import { StripeProvider } from '@stripe/stripe-react-native';
import React from 'react';

/**
 * Le fournisseur Stripe, sur téléphone.
 *
 * Isolé pour que le site n'embarque pas le SDK natif, qui ne se compile pas
 * pour un navigateur. Sur le web, Stripe.js se charge à la demande, au moment
 * de payer (`usePaymentSheet.web.tsx`), et ce fournisseur n'a rien à faire.
 */
export function PaymentProvider({ children }: { children: React.ReactElement | React.ReactElement[] }) {
  return (
    <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_KEY ?? ''}>
      {children}
    </StripeProvider>
  );
}
