import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { categoryById } from '@/data/catalog';
import { colors, radius, spacing } from '@/theme';
import type { WantedRequest } from '@/services/wanted';

/** « il y a trois jours », plutôt qu'une date que personne ne compare. */
export function depuis(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return minutes <= 1 ? "à l'instant" : `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.round(heures / 24);
  if (jours < 31) return jours === 1 ? 'hier' : `il y a ${jours} jours`;
  const mois = Math.round(jours / 30);
  return mois === 1 ? 'il y a un mois' : `il y a ${mois} mois`;
}

/**
 * Les critères en une ligne, et seulement ceux qui ont été remplis.
 *
 * Écrire « toutes marques, toute puissance, sans budget » remplirait la carte
 * de vide. Ce qui n'est pas dit ne contraint rien, et n'a donc pas à
 * s'afficher.
 */
function criteres(demande: WantedRequest): string {
  const bouts: string[] = [];
  if (demande.brands?.length) bouts.push(demande.brands.join(', '));
  if (demande.handedness === 'right') bouts.push('droitier');
  if (demande.handedness === 'left') bouts.push('gaucher');
  if (demande.minDrawWeight != null && demande.maxDrawWeight != null) {
    bouts.push(`${demande.minDrawWeight}–${demande.maxDrawWeight} #`);
  } else if (demande.maxDrawWeight != null) {
    bouts.push(`jusqu’à ${demande.maxDrawWeight} #`);
  } else if (demande.minDrawWeight != null) {
    bouts.push(`à partir de ${demande.minDrawWeight} #`);
  }
  if (demande.maxPrice != null) bouts.push(`≤ ${Math.round(demande.maxPrice)} €`);
  return bouts.join(' · ');
}

export function WantedCard({
  demande,
  onPress,
}: {
  demande: WantedRequest;
  onPress: () => void;
}) {
  const categorie = categoryById(demande.category);
  const ligne = criteres(demande);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.carte, pressed && styles.presse]}
    >
      <View style={styles.entete}>
        <Avatar name={demande.seekerName} color={demande.seekerColor ?? undefined} size={34} />
        <View style={styles.qui}>
          <Text style={styles.nom} numberOfLines={1}>
            {demande.seekerName}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {[demande.seekerCity, depuis(demande.createdAt)].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={styles.etiquette}>
          <MaterialCommunityIcons name={categorie.icon} size={13} color={colors.primary} />
          <Text style={styles.etiquetteTexte}>{categorie.short}</Text>
        </View>
      </View>

      <Text style={styles.titre} numberOfLines={2}>
        {demande.title}
      </Text>

      {demande.detail ? (
        <Text style={styles.detail} numberOfLines={2}>
          {demande.detail}
        </Text>
      ) : null}

      {ligne ? <Text style={styles.criteres}>{ligne}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  carte: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  presse: { backgroundColor: colors.surfaceAlt },
  entete: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qui: { flex: 1 },
  nom: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textFaint },
  etiquette: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  etiquetteTexte: { fontSize: 11, fontWeight: '700', color: colors.primaryDark },
  titre: { fontSize: 16, fontWeight: '700', color: colors.text, lineHeight: 21 },
  detail: { fontSize: 13.5, color: colors.textMuted, lineHeight: 19 },
  criteres: { fontSize: 12.5, fontWeight: '600', color: colors.textFaint },
});
