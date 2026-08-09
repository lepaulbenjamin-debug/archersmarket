import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Header, Screen } from '@/components/Screen';
import { createCheckout, formatCents, priceBreakdown, toCents } from '@/services/payments';
import {
  fetchOffers, fetchRelayPoints, needsRelay,
  type Civility, type DeliveryAddress, type RelayPoint, type ShippingOffer,
} from '@/services/shipping';
import { CivilityPicker } from '@/components/CivilityPicker';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';
import { colors, radius, spacing } from '@/theme';

/**
 * Choix de la livraison, puis paiement.
 *
 * Les tarifs affichés viennent des transporteurs, pas de nous, et le port est
 * recoté au moment de payer : ce que montre cet écran est une information,
 * pas un engagement. C'est aussi pourquoi le total final est celui que renvoie
 * la fonction de paiement.
 */
export default function CheckoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { listings } = useListings();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const listing = useMemo(() => listings.find((item) => item.id === id), [listings, id]);

  const [address, setAddress] = useState<DeliveryAddress>({
    civility: 'M',
    name: user?.name ?? '',
    address: '',
    zip: '',
    city: user?.city ?? '',
    country: 'FR',
    phone: '',
  });
  const [offers, setOffers] = useState<ShippingOffer[] | null>(null);
  const [offer, setOffer] = useState<ShippingOffer | null>(null);
  const [points, setPoints] = useState<RelayPoint[] | null>(null);
  const [point, setPoint] = useState<RelayPoint | null>(null);
  const [handDelivery, setHandDelivery] = useState(!listing?.shipping);
  const [busy, setBusy] = useState<'offers' | 'points' | 'pay' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const adresseComplete =
    address.name.trim().length > 2 &&
    address.address.trim().length > 4 &&
    /^[0-9]{5}$/.test(address.zip.trim()) &&
    address.city.trim().length > 1;

  // Changer d'adresse invalide les tarifs déjà obtenus : ils ne valaient que
  // pour la précédente.
  useEffect(() => {
    setOffers(null);
    setOffer(null);
    setPoints(null);
    setPoint(null);
  }, [address.zip, address.city, address.country]);

  const chercherOffres = useCallback(async () => {
    if (!id || !adresseComplete) return;
    setBusy('offers');
    setError(null);
    try {
      const trouvees = await fetchOffers(id, address);
      setOffers(trouvees);
      if (trouvees.length === 0) setError('Aucun transporteur ne dessert cette adresse pour ce colis.');
    } catch (err) {
      setError((err as Error).message);
      setOffers([]);
    } finally {
      setBusy(null);
    }
  }, [id, address, adresseComplete]);

  const choisirOffre = async (candidate: ShippingOffer) => {
    setOffer(candidate);
    setPoint(null);
    setPoints(null);
    if (!needsRelay(candidate)) return;
    setBusy('points');
    try {
      setPoints(await fetchRelayPoints(candidate, address, 'pickup'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const estimation = useMemo(() => {
    if (!listing) return null;
    return priceBreakdown(toCents(listing.price), handDelivery ? 0 : (offer?.priceCents ?? 0));
  }, [listing, offer, handDelivery]);

  const pretAPayer =
    !!listing &&
    (handDelivery || (adresseComplete && !!offer && (!needsRelay(offer) || !!point)));

  const payer = async () => {
    if (!id || !pretAPayer) return;
    setBusy('pay');
    setError(null);
    try {
      const { orderId, clientSecret } = await createCheckout(id, {
        mode: handDelivery ? 'hand' : needsRelay(offer!) ? 'relay' : 'home',
        civility: address.civility,
        name: address.name,
        address: address.address,
        zip: address.zip,
        city: address.city,
        country: address.country,
        phone: address.phone,
        operator: offer?.operatorCode,
        service: offer?.serviceCode,
        relayCode: point?.code,
        relayLabel: point ? `${point.name}, ${point.address} ${point.zip} ${point.city}` : undefined,
      });

      const { error: init } = await initPaymentSheet({
        merchantDisplayName: 'Archers Market',
        paymentIntentClientSecret: clientSecret,
        allowsDelayedPaymentMethods: false,
        returnURL: 'archersmarket://commande',
        appearance: {
          colors: { primary: colors.primary },
          primaryButton: { shapes: { borderRadius: 999 } },
        },
      });
      if (init) throw new Error(init.message);

      const { error: payment } = await presentPaymentSheet();
      if (payment) {
        // Un abandon n'est pas un incident : la commande reste en attente.
        if (payment.code !== 'Canceled') Alert.alert('Paiement interrompu', payment.message);
        return;
      }
      router.replace(`/order/${orderId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!listing) {
    return (
      <Screen>
        <Header title="Achat" showBack />
        <Text style={styles.absent}>Cette annonce n’est plus disponible.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Livraison et paiement" showBack />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.cardTitle} numberOfLines={2}>{listing.title}</Text>
            <Text style={styles.cardPrice}>{formatCents(toCents(listing.price))}</Text>
          </View>

          {listing.shipping ? (
            <View style={styles.modes}>
              <ModeChip
                label="Faire livrer"
                icon="truck-outline"
                active={!handDelivery}
                onPress={() => setHandDelivery(false)}
              />
              <ModeChip
                label="En main propre"
                icon="handshake-outline"
                active={handDelivery}
                onPress={() => setHandDelivery(true)}
              />
            </View>
          ) : (
            <Text style={styles.note}>
              Ce vendeur ne propose que la remise en main propre.
            </Text>
          )}

          {!handDelivery && (
            <>
              <Text style={styles.section}>Où livrer</Text>
              <CivilityPicker
                value={address.civility}
                onChange={(civility: Civility) => setAddress((prev) => ({ ...prev, civility }))}
              />
              <Field
                label="Nom et prénom"
                value={address.name}
                onChangeText={(name) => setAddress((prev) => ({ ...prev, name }))}
                autoComplete="name"
              />
              <Field
                label="Adresse"
                placeholder="12 rue des Archers"
                value={address.address}
                onChangeText={(value) => setAddress((prev) => ({ ...prev, address: value }))}
                autoComplete="street-address"
              />
              <View style={styles.row}>
                <Field
                  label="Code postal"
                  placeholder="25000"
                  value={address.zip}
                  onChangeText={(zip) => setAddress((prev) => ({ ...prev, zip }))}
                  keyboardType="number-pad"
                  maxLength={5}
                  containerStyle={styles.zip}
                />
                <Field
                  label="Ville"
                  placeholder="Besançon"
                  value={address.city}
                  onChangeText={(city) => setAddress((prev) => ({ ...prev, city }))}
                  containerStyle={styles.flex}
                />
              </View>
              <Field
                label="Téléphone"
                hint="Le transporteur s’en sert pour prévenir de la livraison."
                placeholder="06 12 34 56 78"
                value={address.phone}
                onChangeText={(phone) => setAddress((prev) => ({ ...prev, phone }))}
                keyboardType="phone-pad"
              />

              {offers === null ? (
                <Button
                  label="Voir les transporteurs"
                  variant="secondary"
                  icon="magnify"
                  onPress={chercherOffres}
                  loading={busy === 'offers'}
                  disabled={!adresseComplete}
                />
              ) : (
                <>
                  <Text style={styles.section}>Transporteur</Text>
                  {offers.map((candidate) => {
                    const actif =
                      offer?.operatorCode === candidate.operatorCode &&
                      offer?.serviceCode === candidate.serviceCode;
                    return (
                      <Pressable
                        key={`${candidate.operatorCode}-${candidate.serviceCode}`}
                        accessibilityRole="button"
                        onPress={() => choisirOffre(candidate)}
                        style={[styles.offer, actif && styles.offerActive]}
                      >
                        <View style={styles.flex}>
                          <Text style={styles.offerName}>{candidate.operatorLabel}</Text>
                          <Text style={styles.offerService}>
                            {candidate.deliveryLabel || candidate.serviceLabel}
                          </Text>
                        </View>
                        <Text style={[styles.offerPrice, actif && styles.offerPriceActive]}>
                          {formatCents(candidate.priceCents)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </>
              )}

              {offer && needsRelay(offer) && (
                <>
                  <Text style={styles.section}>Point relais</Text>
                  {busy === 'points' ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    (points ?? []).map((candidate) => (
                      <Pressable
                        key={candidate.code}
                        accessibilityRole="button"
                        onPress={() => setPoint(candidate)}
                        style={[styles.offer, point?.code === candidate.code && styles.offerActive]}
                      >
                        <View style={styles.flex}>
                          <Text style={styles.offerName}>{candidate.name}</Text>
                          <Text style={styles.offerService}>
                            {candidate.address}, {candidate.zip} {candidate.city}
                          </Text>
                        </View>
                      </Pressable>
                    ))
                  )}
                </>
              )}
            </>
          )}

          {estimation && (
            <View style={styles.total}>
              <Line label="Objet" value={formatCents(estimation.item)} />
              {!handDelivery && <Line label="Livraison" value={formatCents(estimation.shipping)} />}
              <Line label="Protection acheteur" value={formatCents(estimation.protection)} />
              <View style={styles.separator} />
              <Line label="Total" value={formatCents(estimation.total)} strong />
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Button
            label="Payer"
            icon="shield-check-outline"
            onPress={payer}
            loading={busy === 'pay'}
            disabled={!pretAPayer}
          />
          <Text style={styles.legal}>
            L’argent est conservé jusqu’à ce que vous confirmiez la réception.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ModeChip({
  label, icon, active, onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.mode, active && styles.modeActive]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={18}
        color={active ? colors.onPrimary : colors.textMuted}
      />
      <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const Line = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <View style={styles.line}>
    <Text style={[styles.lineLabel, strong && styles.lineStrong]}>{label}</Text>
    <Text style={[styles.lineValue, strong && styles.lineStrong]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  absent: { padding: spacing.lg, color: colors.textMuted },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md,
  },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  cardPrice: { fontSize: 16, fontWeight: '800', color: colors.primary },
  modes: { flexDirection: 'row', gap: spacing.sm },
  mode: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12,
  },
  modeActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeLabel: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  modeLabelActive: { color: colors.onPrimary },
  note: { fontSize: 13, color: colors.textMuted },
  section: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  zip: { width: 110 },
  offer: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 12,
  },
  offerActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  offerName: { fontSize: 14, fontWeight: '700', color: colors.text },
  offerService: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  offerPrice: { fontSize: 15, fontWeight: '800', color: colors.text },
  offerPriceActive: { color: colors.primary },
  total: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: spacing.md, gap: 6, marginTop: spacing.sm,
  },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  lineLabel: { fontSize: 13, color: colors.textMuted },
  lineValue: { fontSize: 13, color: colors.text },
  lineStrong: { fontSize: 15, fontWeight: '800', color: colors.text },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  error: { color: colors.danger, fontSize: 13 },
  legal: { fontSize: 12, color: colors.textFaint, textAlign: 'center' },
});
