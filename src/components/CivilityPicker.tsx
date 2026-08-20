import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import type { Civility } from '@/services/shipping';

/**
 * Civilité.
 *
 * Ce n'est pas une donnée dont l'application se sert : rien ne l'affiche, rien
 * ne l'utilise pour trier ou s'adresser aux membres. Les transporteurs
 * l'exigent sur l'étiquette — les vingt-six offres relevées chez Boxtal la
 * réclament — et sans elle aucune expédition ne s'achète.
 */
export function CivilityPicker({
  value,
  onChange,
}: {
  value: Civility;
  onChange: (value: Civility) => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Civilité</Text>
      <View style={styles.row}>
        {(['M', 'Mme'] as const).map((option) => {
          const actif = value === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: actif }}
              onPress={() => onChange(option)}
              style={[styles.chip, actif && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, actif && styles.chipLabelActive]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>Demandée par les transporteurs pour l’étiquette.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    minWidth: 78,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: spacing.lg,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipLabel: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
  chipLabelActive: { color: colors.primaryDark },
  hint: { fontSize: 12, color: colors.textFaint },
});
