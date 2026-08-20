import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { Header, Screen } from '@/components/Screen';
import { formatCents } from '@/services/payments';
import {
  cancelTrip, carrierMissions, confirmDelivery, confirmPickup, formatDepart, myTrips,
  type Adresse, type Mission, type Trip,
} from '@/services/trips';
import { colors, radius, spacing } from '@/theme';

/**
 * Le convoyage, du côté de celui qui roule.
 *
 * Deux listes : ce que j'ai déclaré, et ce qu'on m'a confié. La seconde est la
 * seule qui compte une fois qu'un colis est en jeu — d'où sa place en haut.
 *
 * Les deux codes ne s'affichent jamais ici : le convoyeur les *saisit*. C'est
 * ce qui fait la preuve. S'il pouvait lire celui du vendeur, il pourrait
 * déclarer un enlèvement qui n'a pas eu lieu.
 */
export default function TripsScreen() {
  const router = useRouter();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saisie, setSaisie] = useState<{ orderId: string; code: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mesTrajets, mesColis] = await Promise.all([myTrips(), carrierMissions()]);
      setTrips(mesTrajets);
      setMissions(mesColis);
    } catch (error) {
      Alert.alert('Chargement impossible', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const valider = async (mission: Mission) => {
    if (!saisie || saisie.orderId !== mission.orderId) return;
    setBusy(true);
    try {
      if (mission.status === 'paid') {
        await confirmPickup(mission.orderId, saisie.code);
      } else {
        await confirmDelivery(mission.orderId, saisie.code);
      }
      setSaisie(null);
      await load();
    } catch (error) {
      Alert.alert('Code refusé', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const annuler = (trip: Trip) => {
    Alert.alert('Retirer ce trajet ?', 'Il ne sera plus proposé aux acheteurs.', [
      { text: 'Garder', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelTrip(trip.id);
            await load();
          } catch (error) {
            Alert.alert('Annulation impossible', (error as Error).message);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <Screen>
        <Header title="Mes trajets" showBack />
        <ActivityIndicator style={styles.chargement} color={colors.primary} />
      </Screen>
    );
  }

  const enCours = missions.filter((m) => m.status === 'paid' || m.status === 'shipped');
  const passees = missions.filter((m) => m.status !== 'paid' && m.status !== 'shipped');
  const aVenir = trips.filter((t) => t.status === 'open');

  return (
    <Screen>
      <Header title="Mes trajets" showBack />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {enCours.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitre}>Colis à porter</Text>
            {enCours.map((mission) => {
              const aPrendre = mission.status === 'paid';
              const ouvert = saisie?.orderId === mission.orderId;
              const etape = aPrendre ? mission.from : mission.to;

              return (
                <View key={mission.orderId} style={styles.mission}>
                  <View style={styles.missionEntete}>
                    <MaterialCommunityIcons
                      name={aPrendre ? 'package-up' : 'package-down'}
                      size={20}
                      color={colors.primary}
                    />
                    <View style={styles.flex}>
                      <Text style={styles.missionTitre}>{mission.listingTitle}</Text>
                      <Text style={styles.missionEtat}>
                        {aPrendre
                          ? `À récupérer chez ${mission.sellerName}`
                          : `À remettre à ${mission.to.name}`}
                        {mission.departOn ? ` · départ ${formatDepart(mission.departOn)}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.missionMontant}>{formatCents(mission.contribution)}</Text>
                  </View>

                  <AdresseBloc titre={aPrendre ? 'Enlèvement' : 'Livraison'} adresse={etape} />

                  {ouvert ? (
                    <View style={styles.saisie}>
                      <Field
                        label={
                          aPrendre
                            ? 'Code que le vendeur vous donne'
                            : 'Code que l’acheteur vous donne'
                        }
                        placeholder="0000"
                        value={saisie.code}
                        onChangeText={(code) => setSaisie({ orderId: mission.orderId, code })}
                        keyboardType="number-pad"
                        maxLength={6}
                        hint={
                          aPrendre
                            ? 'À demander au moment où il vous remet le colis, pas avant.'
                            : 'Il ne le donne qu’après avoir vu l’arc.'
                        }
                      />
                      <View style={styles.boutons}>
                        <Button
                          label="Annuler"
                          variant="secondary"
                          size="sm"
                          onPress={() => setSaisie(null)}
                        />
                        <Button
                          label="Valider"
                          size="sm"
                          onPress={() => valider(mission)}
                          loading={busy}
                          disabled={saisie.code.trim().length < 4}
                        />
                      </View>
                    </View>
                  ) : (
                    <Button
                      label={aPrendre ? 'J’ai le colis' : 'Je l’ai remis'}
                      icon={aPrendre ? 'hand-extended-outline' : 'handshake-outline'}
                      size="sm"
                      onPress={() => setSaisie({ orderId: mission.orderId, code: '' })}
                    />
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionEntete}>
            <Text style={styles.sectionTitre}>Trajets déclarés</Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => router.push('/trips/new')}
            >
              <Text style={styles.lien}>Ajouter</Text>
            </Pressable>
          </View>

          {aVenir.length === 0 ? (
            <EmptyState
              icon="map-marker-path"
              title="Aucun trajet déclaré"
              description="Vous allez à une compétition ? Dites-le, et un arc voyagera peut-être avec vous. La participation aux frais vous revient."
              actionLabel="Déclarer un trajet"
              onAction={() => router.push('/trips/new')}
            />
          ) : (
            aVenir.map((trip) => (
              <View key={trip.id} style={styles.trajet}>
                <View style={styles.flex}>
                  <Text style={styles.trajetRoute}>
                    {trip.fromCity} → {trip.toCity}
                  </Text>
                  <Text style={styles.trajetDetail}>
                    {formatDepart(trip.departOn)} · {formatCents(trip.contribution)}
                  </Text>
                  {trip.note ? <Text style={styles.trajetNote}>{trip.note}</Text> : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retirer ce trajet"
                  hitSlop={10}
                  onPress={() => annuler(trip)}
                >
                  <MaterialCommunityIcons name="close" size={20} color={colors.textFaint} />
                </Pressable>
              </View>
            ))
          )}
        </View>

        {passees.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitre}>Convoyages terminés</Text>
            {passees.map((mission) => (
              <View key={mission.orderId} style={styles.passee}>
                <MaterialCommunityIcons
                  name="check-circle-outline"
                  size={18}
                  color={colors.success}
                />
                <Text style={styles.flex} numberOfLines={1}>
                  {mission.listingTitle}
                </Text>
                <Text style={styles.missionMontant}>{formatCents(mission.contribution)}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.aide}>
          Ce que vous recevez est une participation à vos frais de route, versée après la
          livraison. Ce n’est pas un revenu de transport, et c’est ce qui rend ce service possible
          sans inscription au registre des transporteurs.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function AdresseBloc({ titre, adresse }: { titre: string; adresse: Adresse }) {
  return (
    <View style={styles.adresse}>
      <Text style={styles.adresseTitre}>{titre}</Text>
      <Text style={styles.adresseTexte}>
        {adresse.civility} {adresse.name}
      </Text>
      <Text style={styles.adresseTexte}>{adresse.address}</Text>
      <Text style={styles.adresseTexte}>
        {adresse.zip} {adresse.city}
      </Text>
      {adresse.phone ? <Text style={styles.adresseTexte}>{adresse.phone}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  chargement: { marginTop: spacing.xxl },
  flex: { flex: 1 },
  section: { gap: spacing.md },
  sectionEntete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitre: { fontSize: 15, fontWeight: '700', color: colors.text },
  lien: { fontSize: 13, fontWeight: '600', color: colors.primary },

  mission: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  missionEntete: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  missionTitre: { fontSize: 14, fontWeight: '700', color: colors.text },
  missionEtat: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  missionMontant: { fontSize: 14, fontWeight: '700', color: colors.primary },

  adresse: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md },
  adresseTitre: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textFaint,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  adresseTexte: { fontSize: 13, color: colors.text, lineHeight: 19 },

  saisie: { gap: spacing.md },
  boutons: { flexDirection: 'row', gap: spacing.md },

  trajet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  trajetRoute: { fontSize: 14, fontWeight: '600', color: colors.text },
  trajetDetail: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  trajetNote: { fontSize: 12, color: colors.textFaint, marginTop: 4 },

  passee: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  aide: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
});
