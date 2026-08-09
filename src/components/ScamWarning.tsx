import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

/**
 * L'avertissement qui compte.
 *
 * Il s'affiche sous un message où quelqu'un propose de payer autrement que
 * par l'application. C'est ce moment-là qui décide de tout : une fois
 * l'argent parti par virement, il n'y a plus ni séquestre, ni litige, ni
 * remboursement — et plus rien à faire pour la personne.
 *
 * Il ne s'affiche qu'au destinataire. Prévenir l'auteur du message ne
 * protégerait personne et apprendrait au fraudeur ce qui le trahit.
 */
export function ScamWarning() {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name="shield-alert-outline" size={18} color={colors.danger} />
      <View style={styles.text}>
        <Text style={styles.title}>Ne payez pas en dehors d’Archers Market</Text>
        <Text style={styles.body}>
          Ce message propose un règlement hors de l’application. Si vous acceptez, vous perdez
          la protection : l’argent part sans recours, et nous ne pourrons rien rembourser.
          Les arnaques commencent presque toujours ainsi.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: 6,
  },
  text: { flex: 1, gap: 3 },
  title: { fontSize: 13, fontWeight: '800', color: colors.danger },
  body: { fontSize: 12, color: colors.danger, lineHeight: 17 },
});
