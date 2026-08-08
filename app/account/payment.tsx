import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Header, Screen } from '@/components/Screen';
import { startSellerOnboarding } from '@/services/payments';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';

/**
 * Vérification du vendeur auprès de Stripe.
 *
 * Cet écran est aussi la destination du lien de retour : Stripe n'accepte
 * qu'une adresse https, la page du site rebondit donc ici. Sans cette route,
 * le vendeur qui termine son inscription retombe sur un écran « page
 * introuvable » — ce qui donne l'impression que tout a échoué alors que tout
 * a réussi.
 */
export default function PaymentSetupScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();

  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Relit l'état chez Stripe : c'est la seule source de vérité. */
  const refresh = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const state = await startSellerOnboarding();
      setReady(state.ready);
      setUrl(state.url ?? null);
      await refreshUser?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }, [refreshUser]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Ouvre le formulaire dans un navigateur intégré plutôt qu'en quittant
   * l'app. La session se referme d'elle-même au retour, et l'état est relu
   * dans la foulée — le vendeur n'a rien à faire de plus.
   */
  const open = async () => {
    if (!url) return;
    try {
      await WebBrowser.openAuthSessionAsync(url, 'archersmarket://account/payment');
    } catch (err) {
      setError((err as Error).message);
    }
    await refresh();
  };

  return (
    <Screen>
      <Header title="Recevoir des paiements" showBack />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {checking ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.centerText}>Vérification auprès de Stripe…</Text>
          </View>
        ) : error ? (
          <>
            <View style={[styles.bandeau, styles.bandeauErreur]}>
              <MaterialCommunityIcons name="alert-outline" size={20} color={colors.danger} />
              <Text style={styles.bandeauErreurText}>{error}</Text>
            </View>
            <Button label="Réessayer" icon="refresh" onPress={refresh} />
          </>
        ) : ready ? (
          <>
            <View style={[styles.bandeau, styles.bandeauOk]}>
              <MaterialCommunityIcons name="check-circle-outline" size={20} color={colors.success} />
              <Text style={styles.bandeauOkText}>
                Votre identité est vérifiée. Vos acheteurs peuvent payer dans l’application.
              </Text>
            </View>
            <Text style={styles.paragraphe}>
              Sur vos annonces qui proposent l’envoi, un bouton <Text style={styles.gras}>Acheter</Text>{' '}
              apparaît désormais. Vous touchez votre prix entier et vos frais de port : les frais de
              protection sont à la charge de l’acheteur.
            </Text>
            <Text style={styles.paragraphe}>
              L’argent vous est versé une fois que l’acheteur a confirmé la réception, ou
              automatiquement quatorze jours après l’expédition.
            </Text>
            <Button
              label="Voir mes transactions"
              icon="shield-check-outline"
              variant="secondary"
              onPress={() => router.replace('/orders')}
            />
          </>
        ) : (
          <>
            <View style={styles.intro}>
              <MaterialCommunityIcons name="bank-outline" size={28} color={colors.primary} />
              <Text style={styles.introTitle}>Encore quelques informations</Text>
              <Text style={styles.introText}>
                Stripe, notre prestataire de paiement, doit vérifier votre identité avant de pouvoir
                vous verser de l’argent. C’est une obligation légale, pas une formalité de notre
                part.
              </Text>
            </View>

            <View style={styles.liste}>
              <Text style={styles.listeTitre}>Ce qui vous sera demandé</Text>
              {['Vos nom et prénom', 'Votre date de naissance', 'Votre adresse', 'Votre IBAN'].map(
                (item) => (
                  <View key={item} style={styles.ligne}>
                    <MaterialCommunityIcons name="circle-small" size={20} color={colors.textFaint} />
                    <Text style={styles.ligneText}>{item}</Text>
                  </View>
                ),
              )}
              <Text style={styles.note}>
                Ces informations vont directement chez Stripe. Elles ne passent pas par nous et nous
                ne les conservons pas.
              </Text>
            </View>

            <Button
              label={user?.acceptsPayments ? 'Compléter ma vérification' : 'Commencer'}
              icon="arrow-right"
              onPress={open}
              disabled={!url}
            />
            <Button label="Actualiser l’état" variant="ghost" icon="refresh" onPress={refresh} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  center: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxl },
  centerText: { fontSize: 14, color: colors.textMuted },
  bandeau: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  bandeauOk: { backgroundColor: colors.successSoft },
  bandeauOkText: { flex: 1, fontSize: 13.5, color: colors.success, lineHeight: 19 },
  bandeauErreur: { backgroundColor: colors.dangerSoft },
  bandeauErreurText: { flex: 1, fontSize: 13.5, color: colors.danger, lineHeight: 19 },
  intro: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.xl,
  },
  introTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  introText: { fontSize: 14, color: colors.textMuted, lineHeight: 20, textAlign: 'center' },
  liste: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 2,
  },
  listeTitre: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  ligne: { flexDirection: 'row', alignItems: 'center' },
  ligneText: { fontSize: 14, color: colors.textMuted },
  note: { fontSize: 12, color: colors.textFaint, lineHeight: 17, marginTop: spacing.sm },
  paragraphe: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  gras: { fontWeight: '700', color: colors.text },
});
