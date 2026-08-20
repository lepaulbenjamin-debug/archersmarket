import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { NOUVEAUTES } from '@/data/whatsNew';
import { colors, radius, spacing } from '@/theme';

/**
 * Ce qui a changé depuis la dernière fois.
 *
 * Un encart, et non un second accueil : quelqu'un qui utilise déjà
 * l'application n'a pas besoin qu'on lui réexplique à quoi elle sert. Il veut
 * savoir ce qui a bougé, en dix secondes, et retourner à ses annonces.
 *
 * D'où une feuille qui se ferme d'un geste, et pas quatre écrans à faire
 * défiler.
 */
export function WhatsNew({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Toucher à côté ferme : c'est le geste qu'on tente d'instinct, et le
          refuser donne l'impression d'être coincé. */}
      <Pressable style={styles.voile} onPress={onClose} accessibilityLabel="Fermer" />

      <View style={styles.feuille}>
        <View style={styles.poignee} />

        <View style={styles.entete}>
          <MaterialCommunityIcons name="party-popper" size={22} color={colors.primary} />
          <Text style={styles.titre}>{NOUVEAUTES.titre}</Text>
        </View>

        <ScrollView style={styles.corps} showsVerticalScrollIndicator={false}>
          {NOUVEAUTES.points.map((point) => (
            <View key={point.texte} style={styles.point}>
              <View style={styles.rond}>
                <MaterialCommunityIcons
                  name={point.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
                  size={19}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.texte}>{point.texte}</Text>
            </View>
          ))}
        </ScrollView>

        <Button label="C’est parti" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  voile: { flex: 1, backgroundColor: 'rgba(27, 27, 29, 0.45)' },
  feuille: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
    maxHeight: '80%',
  },
  poignee: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  entete: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titre: { flex: 1, fontSize: 19, fontWeight: '800', color: colors.text, lineHeight: 25 },
  corps: { flexGrow: 0 },
  point: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  rond: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texte: { flex: 1, fontSize: 13.5, color: colors.text, lineHeight: 19.5 },
});
