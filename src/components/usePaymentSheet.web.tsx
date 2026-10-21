import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe, type StripeElementsOptions } from '@stripe/stripe-js';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import type { PaymentOutcome, PaymentRequest } from '@/components/usePaymentSheet';
import { colors, radius, spacing } from '@/theme';

/**
 * Confirmer un paiement, sur le site : le Payment Element de Stripe.js.
 *
 * Même interface que la feuille native (`usePaymentSheet.tsx`) : `pay` rend
 * une promesse qui se résout quand l'acheteur a payé ou renoncé, et `sheet`
 * est la fenêtre à poser dans l'écran. Le PaymentIntent est le même que sur
 * téléphone — créé par la fonction `stripe-checkout` avec
 * `automatic_payment_methods`, ce qu'attend précisément le Payment Element.
 * Rien n'a changé côté serveur.
 *
 * Les champs de carte sont dessinés par Stripe, dans son propre cadre : les
 * numéros ne transitent jamais par notre page, ni par nos serveurs.
 */

// Chargé au premier paiement, pas à l'ouverture du site : la plupart des
// visiteurs ne paient pas, et Stripe.js n'a rien à faire sur leur page.
let stripePromise: Promise<Stripe | null> | null = null;
const getStripe = () =>
  (stripePromise ??= loadStripe(process.env.EXPO_PUBLIC_STRIPE_KEY ?? ''));

const APPARENCE: StripeElementsOptions['appearance'] = {
  theme: 'stripe',
  variables: {
    colorPrimary: colors.primary,
    colorText: colors.text,
    colorDanger: colors.danger,
    borderRadius: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
};

export function usePaymentSheet(): {
  pay: (request: PaymentRequest) => Promise<PaymentOutcome>;
  sheet: React.ReactNode;
} {
  const [demande, setDemande] = useState<PaymentRequest | null>(null);
  const conclure = useRef<((issue: PaymentOutcome) => void) | null>(null);

  const terminer = useCallback((issue: PaymentOutcome) => {
    conclure.current?.(issue);
    conclure.current = null;
    setDemande(null);
  }, []);

  const pay = useCallback(
    (request: PaymentRequest) =>
      new Promise<PaymentOutcome>((resolve) => {
        conclure.current = resolve;
        setDemande(request);
      }),
    [],
  );

  const sheet = demande ? (
    <Modal visible transparent animationType="fade" onRequestClose={() => terminer('cancelled')}>
      <View style={styles.fond}>
        <View style={styles.fenetre}>
          <View style={styles.entete}>
            <Text style={styles.titre}>Paiement sécurisé</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              onPress={() => terminer('cancelled')}
              hitSlop={10}
            >
              <Text style={styles.fermer}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.chapo}>
            Votre argent est conservé jusqu’à ce que vous confirmiez avoir reçu le matériel. Les
            champs de carte sont ceux de Stripe : votre numéro ne passe jamais par Archers Market.
          </Text>
          <ScrollView contentContainerStyle={styles.corps}>
            <Elements
              stripe={getStripe()}
              options={{ clientSecret: demande.clientSecret, locale: 'fr', appearance: APPARENCE }}
            >
              <Formulaire orderId={demande.orderId} onDone={terminer} />
            </Elements>
          </ScrollView>
        </View>
      </View>
    </Modal>
  ) : null;

  return { pay, sheet };
}

function Formulaire({
  orderId,
  onDone,
}: {
  orderId: string;
  onDone: (issue: PaymentOutcome) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [pret, setPret] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const confirmer = async () => {
    if (!stripe || !elements) return;
    setEnCours(true);
    setErreur(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // Certaines banques exigent une validation sur leur propre page
        // (3-D Secure). Stripe y emmène l'acheteur puis le ramène ici, sur la
        // commande — qui affiche alors son état réel, mis à jour par le
        // webhook, plutôt qu'un « merci » présumé.
        return_url: `${window.location.origin}/order/${orderId}`,
      },
      // Sans redirection quand elle n'est pas nécessaire : la plupart des
      // cartes se valident sur place, et l'acheteur reste sur son écran.
      redirect: 'if_required',
    });

    if (error) {
      // Carte refusée, champ incomplet : la fenêtre reste ouverte, on peut
      // corriger et recommencer sans refaire toute la commande.
      setErreur(error.message ?? 'Paiement refusé.');
      setEnCours(false);
      return;
    }

    if (paymentIntent && ['succeeded', 'processing', 'requires_capture'].includes(paymentIntent.status)) {
      onDone('paid');
      return;
    }

    setErreur('Le paiement n’a pas abouti. Vous pouvez réessayer.');
    setEnCours(false);
  };

  return (
    <View style={styles.formulaire}>
      {pret ? null : (
        <View style={styles.attente}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
      <PaymentElement onReady={() => setPret(true)} options={{ layout: 'tabs' }} />

      {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

      <Button
        label="Payer"
        icon="lock-outline"
        onPress={confirmer}
        loading={enCours}
        disabled={!pret || !stripe}
      />
      <Button label="Annuler" variant="ghost" onPress={() => onDone('cancelled')} disabled={enCours} />
    </View>
  );
}

const styles = StyleSheet.create({
  fond: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  fenetre: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '92%',
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titre: { fontSize: 19, fontWeight: '800', color: colors.text },
  fermer: { fontSize: 18, color: colors.textMuted },
  chapo: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  corps: { paddingBottom: spacing.sm },
  formulaire: { gap: spacing.md },
  attente: { paddingVertical: spacing.xl, alignItems: 'center' },
  erreur: { fontSize: 13.5, color: colors.danger, lineHeight: 19 },
});
