import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker, type Region } from 'react-native-maps';

import { colors, radius, spacing } from '@/theme';
import type { RelayPoint } from '@/services/shipping';

const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/** « 9h00 – 12h30, 14h00 – 19h00 », ou rien si le point est fermé ce jour-là. */
function horaireDuJour(jour: RelayPoint['hours'][number]): string | null {
  const plages: string[] = [];
  const propre = (h: string | null) => (h && h !== '00:00' ? h.slice(0, 5).replace(':', 'h') : null);
  const [oa, ca, op, cp] = [propre(jour.openAm), propre(jour.closeAm), propre(jour.openPm), propre(jour.closePm)];
  if (oa && ca) plages.push(`${oa} – ${ca}`);
  if (op && cp) plages.push(`${op} – ${cp}`);
  return plages.length ? plages.join(', ') : null;
}

/**
 * Choix d'un point relais, sur carte.
 *
 * Une liste d'adresses ne dit rien à personne : « 17 rue des Prés » ne se
 * situe pas. La carte, si — et c'est le seul moyen de voir qu'un point est à
 * deux rues de chez soi plutôt qu'à l'autre bout de la ville.
 *
 * La liste reste dessous, parce qu'elle porte ce que la carte ne peut pas
 * montrer : les horaires. Un relais fermé le lundi n'est pas un détail quand
 * on choisit où retirer son arc.
 */
/**
 * La carte est-elle utilisable sur cet appareil ?
 *
 * Sur Android, `react-native-maps` s'adosse à Google Maps, qui exige une clé
 * déclarée dans le manifeste. Sans elle, le composant ne se plaint pas : il
 * affiche un rectangle gris, ce qui est pire qu'une absence — l'utilisateur
 * croit à une panne et n'a aucune raison de faire défiler jusqu'à la liste,
 * qui est pourtant l'outil utile de cet écran.
 *
 * Sur iOS, Apple Maps ne demande rien : la carte s'affiche toujours.
 */
const CARTE_DISPONIBLE =
  Platform.OS !== 'android'
  || Boolean(
    (Constants.expoConfig?.android as { config?: { googleMaps?: { apiKey?: string } } } | undefined)
      ?.config?.googleMaps?.apiKey,
  );

export function RelayPointPicker({
  points,
  selected,
  onSelect,
}: {
  points: RelayPoint[];
  selected: RelayPoint | null;
  onSelect: (point: RelayPoint) => void;
}) {
  const [ouvert, setOuvert] = useState<string | null>(null);

  const situes = useMemo(
    () => points.filter((p) => p.latitude != null && p.longitude != null),
    [points],
  );

  // Cadrage sur l'ensemble des points, avec une marge pour que les épingles
  // des bords ne collent pas au cadre.
  const region = useMemo<Region | null>(() => {
    if (situes.length === 0) return null;
    const lats = situes.map((p) => p.latitude as number);
    const lngs = situes.map((p) => p.longitude as number);
    const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
    const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.6),
      longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.6),
    };
  }, [situes]);

  return (
    <View style={styles.container}>
      {region && CARTE_DISPONIBLE ? (
        <View style={styles.carteCadre}>
          <MapView style={styles.carte} initialRegion={region}>
            {situes.map((point) => (
              <Marker
                key={point.code}
                coordinate={{ latitude: point.latitude as number, longitude: point.longitude as number }}
                title={point.name}
                description={`${point.address}, ${point.city}`}
                pinColor={selected?.code === point.code ? colors.primary : undefined}
                onPress={() => onSelect(point)}
              />
            ))}
          </MapView>
        </View>
      ) : null}

      <ScrollView style={styles.liste} nestedScrollEnabled>
        {points.map((point) => {
          const actif = selected?.code === point.code;
          const deplie = ouvert === point.code;
          const horaires = (point.hours ?? [])
            .map((jour) => ({ jour: JOURS[jour.weekday] ?? '', plage: horaireDuJour(jour) }))
            .filter((ligne) => ligne.jour);

          return (
            <View key={point.code} style={[styles.point, actif && styles.pointActif]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: actif }}
                onPress={() => onSelect(point)}
                style={styles.pointHaut}
              >
                <MaterialCommunityIcons
                  name={actif ? 'map-marker-check' : 'map-marker-outline'}
                  size={18}
                  color={actif ? colors.primary : colors.textFaint}
                />
                <View style={styles.flex}>
                  <Text style={styles.nom}>{point.name}</Text>
                  <Text style={styles.adresse}>
                    {point.address}, {point.zip} {point.city}
                  </Text>
                </View>
              </Pressable>

              {horaires.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setOuvert(deplie ? null : point.code)}
                  hitSlop={6}
                >
                  <Text style={styles.lien}>
                    {deplie ? 'Masquer les horaires' : 'Voir les horaires'}
                  </Text>
                </Pressable>
              ) : null}

              {deplie
                ? horaires.map((ligne) => (
                    <View key={ligne.jour} style={styles.horaire}>
                      <Text style={styles.jour}>{ligne.jour}</Text>
                      <Text style={[styles.plage, !ligne.plage && styles.ferme]}>
                        {ligne.plage ?? 'Fermé'}
                      </Text>
                    </View>
                  ))
                : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  flex: { flex: 1 },
  carteCadre: {
    height: 220,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  carte: { flex: 1 },
  // Bornée, sinon la liste des relais chasse le bouton de paiement hors de
  // l'écran — on connaît déjà le prix d'un bouton qu'on ne voit pas.
  liste: { maxHeight: Platform.OS === 'ios' ? 300 : 280 },
  point: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    marginBottom: spacing.sm,
    gap: 4,
  },
  pointActif: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pointHaut: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nom: { fontSize: 14, fontWeight: '700', color: colors.text },
  adresse: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  lien: { fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 2 },
  horaire: { flexDirection: 'row', justifyContent: 'space-between' },
  jour: { fontSize: 12, color: colors.textMuted },
  plage: { fontSize: 12, color: colors.text },
  ferme: { color: colors.textFaint },
});
