import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

/**
 * L'avertissement qui compte.
 *
 * Il s'affiche sous un message où quelqu'un propose de déplacer le paiement
 * ailleurs — virement, cagnotte, service tiers. C'est ce moment-là qui décide
 * de tout : une fois l'argent parti par virement, il n'y a plus ni séquestre,
 * ni litige, ni remboursement.
 *
 * Il ne vise pas le paiement en espèces lors d'une remise en main propre :
 * c'est un mode de vente prévu, et le détecteur le pèse d'ailleurs bien plus
 * légèrement. Ce qu'on cherche à empêcher, c'est de payer *avant* d'avoir vu
 * l'arc, à quelqu'un qu'on ne rencontrera peut-être jamais.
 *
 * Il ne s'affiche qu'au destinataire. Prévenir l'auteur du message ne
 * protégerait personne et lui apprendrait ce qui le trahit.
 */
export function ScamWarning() {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name="shield-alert-outline" size={18} color={colors.danger} />
      <View style={styles.text}>
        <Text style={styles.title}>Ne payez jamais d’avance, hors de l’application</Text>
        <Text style={styles.body}>
          Ce message propose un règlement par un autre canal. Si vous acceptez, l’argent part
          sans recours : nous ne pourrons rien rembourser. Payez par l’application, ou en main
          propre une fois l’arc essayé — jamais avant.
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
