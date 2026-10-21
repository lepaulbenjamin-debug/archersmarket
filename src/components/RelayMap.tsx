import Constants from 'expo-constants';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { colors, radius } from '@/theme';
import type { RelayPoint } from '@/services/shipping';

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

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

/**
 * La carte des points relais, sur téléphone. À part pour que le site
 * n'embarque pas `react-native-maps`, qui n'existe pas dans un navigateur
 * (`RelayMap.web.tsx`).
 */
export function RelayMap({
  points,
  region,
  selected,
  onSelect,
}: {
  points: RelayPoint[];
  region: MapRegion;
  selected: RelayPoint | null;
  onSelect: (point: RelayPoint) => void;
}) {
  if (!CARTE_DISPONIBLE) return null;
  return (
    <View style={styles.cadre}>
      <MapView style={styles.carte} initialRegion={region}>
        {points.map((point) => (
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
  );
}

const styles = StyleSheet.create({
  cadre: {
    height: 220,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  carte: { flex: 1 },
});
