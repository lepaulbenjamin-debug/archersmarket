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
import {
  createCheckout, formatCents, handoverBreakdown, priceBreakdown, toCents,
} from '@/services/payments';
import {
  deliversToRelay, fetchOffers, fetchRelayPoints, fetchSellerAddress,
  formatDeliveryDate, needsRelay,
  type Civility, type DeliveryAddress, type RelayPoint, type ShippingOffer,
} from '@/services/shipping';
import { AddressField } from '@/components/AddressField';
import { RelayPointPicker } from '@/components/RelayPointPicker';
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
  const { user, userById } = useAuth();
  const { listings } = useListings();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const listing = useMemo(() => listings.find((item) => item.id === id), [listings, id]);
  const seller = listing ? userById(listing.sellerId) : undefined;

  // Le paiement séquestré suppose un vendeur vérifié chez Stripe : sans cela,
  // l'argent encaissé n'aurait nulle part où aller. La remise, elle, reste
  // toujours possible.
  const escrowPossible = !!seller?.acceptsPayments && !!listing?.shipping;

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
  const [handDelivery, setHandDelivery] = useState(true);
  const [busy, setBusy] = useState<'offers' | 'points' | 'pay' | null>(null);
  // Vingt et une offres à la suite, personne ne les lit. On les range par
  // destination : c'est la question que se pose l'acheteur en premier —
  // « je vais le chercher, ou on me l'apporte ? »
  const [famille, setFamille] = useState<'relay' | 'home'>('relay');
  const [toutVoir, setToutVoir] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * L'adresse enregistrée dans le compte sert de point de départ. C'est la
   * même personne et la même boîte aux lettres : la resaisir à chaque achat
   * n'apporte rien, sinon des fautes de frappe.
   */
  useEffect(() => {
    let vivant = true;
    fetchSellerAddress()
      .then((mienne) => {
        if (!vivant || !mienne) return;
        setAddress((prev) =>
          // On ne recouvre pas ce que l'acheteur a déjà commencé à taper.
          prev.address.trim() || prev.zip.trim()
            ? prev
            : {
                civility: mienne.civility,
                name: mienne.fullName,
                address: mienne.address,
                zip: mienne.zip,
                city: mienne.city,
                country: mienne.country,
                phone: mienne.phone,
              },
        );
      })
      .catch(() => undefined);
    return () => {
      vivant = false;
    };
  }, []);

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

  const familles = useMemo(() => {
    const liste = offers ?? [];
    return {
      relay: liste.filter(deliversToRelay),
      home: liste.filter((candidate) => !deliversToRelay(candidate)),
    };
  }, [offers]);

  // On ouvre sur la famille la moins chère : c'est presque toujours le relais,
  // mais mieux vaut le constater que le supposer.
  useEffect(() => {
    if (!offers?.length) return;
    const moinsCher = (liste: ShippingOffer[]) =>
      liste.length ? Math.min(...liste.map((o) => o.priceCents)) : Infinity;
    setFamille(moinsCher(familles.relay) <= moinsCher(familles.home) ? 'relay' : 'home');
    setToutVoir(false);
  }, [offers, familles]);

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
    // En remise, nous n'encaissons que la mise en relation : le prix de l'arc
    // se règle sur place et n'entre pas dans ce que l'acheteur nous paie.
    return handDelivery
      ? handoverBreakdown(toCents(listing.price))
      : priceBreakdown(toCents(listing.price), offer?.priceCents ?? 0);
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

          {escrowPossible ? (
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
              {listing.shipping
                ? 'Ce vendeur n’a pas encore activé le paiement sécurisé : la vente se fait en main propre.'
                : 'Ce vendeur ne propose que la remise en main propre.'}
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
              <AddressField
                placeholder="12 rue des Archers"
                value={address.address}
                onChangeText={(value) => setAddress((prev) => ({ ...prev, address: value }))}
                onSelect={(choix) =>
                  setAddress((prev) => ({
                    ...prev,
                    address: choix.street,
                    zip: choix.zip,
                    city: choix.city,
                  }))
                }
                hint="Choisissez dans la liste : le code postal et la ville se remplissent seuls."
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
                  <View style={styles.familles}>
                    {([
                      ['relay', 'En point relais', familles.relay],
                      ['home', 'À domicile', familles.home],
                    ] as const).map(([cle, libelle, liste]) => {
                      const actif = famille === cle;
                      const mini = liste.length
                        ? Math.min(...liste.map((o) => o.priceCents))
                        : null;
                      return (
                        <Pressable
                          key={cle}
                          accessibilityRole="button"
                          accessibilityState={{ selected: actif }}
                          disabled={liste.length === 0}
                          onPress={() => {
                            setFamille(cle);
                            setToutVoir(false);
                          }}
                          style={[
                            styles.famille,
                            actif && styles.familleActive,
                            liste.length === 0 && styles.familleVide,
                          ]}
                        >
                          <Text style={[styles.familleLabel, actif && styles.familleLabelActive]}>
                            {libelle}
                          </Text>
                          <Text style={[styles.familleMeta, actif && styles.familleMetaActive]}>
                            {mini === null
                              ? 'aucune'
                              : `${liste.length} · dès ${formatCents(mini)}`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {(toutVoir ? familles[famille] : familles[famille].slice(0, 5)).map((candidate) => {
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
                          {/* Le nom du service, pas la destination : celle-ci est
                              déjà donnée par l'onglet. Et c'est lui qui
                              distingue « Chrono Relais 13 » de « Chrono
                              Relais 13 collecte », que le libellé de livraison
                              confondait — d'où deux lignes en apparence
                              identiques à deux tarifs différents. */}
                          <Text style={styles.offerService}>
                            {candidate.serviceLabel || candidate.deliveryLabel}
                          </Text>
                          {formatDeliveryDate(candidate.deliveryDate) ? (
                            <Text style={styles.offerDate}>
                              Livré {formatDeliveryDate(candidate.deliveryDate)}
                            </Text>
                          ) : null}
                          {candidate.insuranceCents > 0 ? (
                            <Text style={styles.offerAssurance}>
                              Assurance comprise, {formatCents(candidate.insuranceCents)}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={[styles.offerPrice, actif && styles.offerPriceActive]}>
                          {formatCents(candidate.priceCents)}
                        </Text>
                      </Pressable>
                    );
                  })}

                  {!toutVoir && familles[famille].length > 5 ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setToutVoir(true)}
                      hitSlop={6}
                    >
                      <Text style={styles.voirPlus}>
                        Voir les {familles[famille].length - 5} autres
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              )}

              {offer && needsRelay(offer) && (
                <>
                  <Text style={styles.section}>Point relais</Text>
                  {busy === 'points' ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <RelayPointPicker
                      points={points ?? []}
                      selected={point}
                      onSelect={setPoint}
                    />
                  )}
                </>
              )}
            </>
          )}

          {handDelivery && (
            <View style={styles.remise}>
              <Text style={styles.remiseTitre}>Remise vérifiée — 0,99 €</Text>
              <Text style={styles.remiseTexte}>
                Vous réglez l’arc directement au vendeur, sur place, une fois que vous l’avez
                essayé. Nous ne touchons pas cet argent : {'\n'}
                <Text style={styles.remiseFort}>nous ne pouvons donc rien vous rembourser.</Text>
              </Text>
              <Text style={styles.remiseTexte}>
                Ce que couvrent les 0,99 € : un vendeur identifié, une trace de la vente, un code
                que vous ne donnez qu’après avoir vu l’arc, et un recours auprès de nous en cas
                de problème.
              </Text>
            </View>
          )}

          {estimation && (
            <View style={styles.total}>
              <Line
                label={handDelivery ? 'Objet, payé sur place' : 'Objet'}
                value={formatCents(estimation.item)}
                muted={handDelivery}
              />
              {!handDelivery && (
                <Line
                  label={offer && offer.insuranceCents > 0 ? 'Livraison assurée' : 'Livraison'}
                  value={formatCents(estimation.shipping)}
                />
              )}
              <Line
                label={handDelivery ? 'Remise vérifiée' : 'Protection acheteur'}
                value={formatCents(estimation.protection)}
              />
              <View style={styles.separator} />
              <Line
                label={handDelivery ? 'À payer maintenant' : 'Total'}
                value={formatCents(estimation.total)}
                strong
              />
              {offer && offer.insuranceCents > 0 && (
                <Text style={styles.assuranceNote}>
                  Le colis est assuré pour {formatCents(toCents(listing.price))}. Sans cela, un
                  transporteur ne rembourse que 23 € par kilo — soit rarement plus de 70 € pour un
                  arc.
                </Text>
              )}
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
            {handDelivery
              ? 'Vous payez l’arc au vendeur lors de la remise, pas ici.'
              : 'L’argent est conservé jusqu’à ce que vous confirmiez la réception.'}
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

const Line = ({
  label, value, strong, muted,
}: { label: string; value: string; strong?: boolean; muted?: boolean }) => (
  <View style={styles.line}>
    <Text style={[styles.lineLabel, strong && styles.lineStrong, muted && styles.lineMuted]}>
      {label}
    </Text>
    <Text style={[styles.lineValue, strong && styles.lineStrong, muted && styles.lineMuted]}>
      {value}
    </Text>
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
  offerAssurance: {
    fontSize: 12,
    color: colors.primary,
    marginTop: 2,
  },
  assuranceNote: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
  offerDate: { fontSize: 11.5, color: colors.textFaint, marginTop: 1 },
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
  lineMuted: { color: colors.textFaint },
  familles: { flexDirection: 'row', gap: spacing.sm },
  famille: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
  },
  familleActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  familleVide: { opacity: 0.4 },
  familleLabel: { fontSize: 13.5, fontWeight: '700', color: colors.textMuted },
  familleLabelActive: { color: colors.primaryDark },
  familleMeta: { fontSize: 11, color: colors.textFaint },
  familleMetaActive: { color: colors.primaryDark },
  voirPlus: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  remise: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  remiseTitre: { fontSize: 14, fontWeight: '800', color: colors.primaryDark },
  remiseTexte: { fontSize: 12.5, color: colors.text, lineHeight: 18 },
  remiseFort: { fontWeight: '800' },
  error: { color: colors.danger, fontSize: 13 },
  legal: { fontSize: 12, color: colors.textFaint, textAlign: 'center' },
});
