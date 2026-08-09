import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/theme';

/**
 * « Identité vérifiée ».
 *
 * Ce que la pastille dit exactement : Stripe a contrôlé une pièce d'identité
 * et des coordonnées bancaires à ce nom. Elle ne dit rien de l'honnêteté du
 * vendeur, ni de l'état de son matériel — seulement qu'il ne se cache pas, et
 * qu'un compte banni ne se recréera pas en deux minutes.
 *
 * C'est la contrepartie visible de ce qu'on demande aux vendeurs : se
 * présenter lève leur plafond de publication, et se voit par les acheteurs.
 */
export function VerifiedBadge({ compact }: { compact?: boolean }) {
  return (
    <View style={[styles.badge, compact && styles.compact]}>
      <MaterialCommunityIcons name="shield-check" size={compact ? 12 : 14} color={colors.success} />
      <Text style={[styles.label, compact && styles.labelCompact]}>
        {compact ? 'Vérifié' : 'Identité vérifiée'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: colors.successSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  compact: { paddingHorizontal: 6, paddingVertical: 2 },
  label: { fontSize: 11.5, fontWeight: '700', color: colors.success },
  labelCompact: { fontSize: 10.5 },
});
