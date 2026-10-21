import React from 'react';

/** Sur le site, rien à fournir : Stripe.js se charge au moment de payer. */
export function PaymentProvider({ children }: { children: React.ReactElement | React.ReactElement[] }) {
  return <>{children}</>;
}
