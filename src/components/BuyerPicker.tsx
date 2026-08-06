import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { fetchInterestedBuyers } from '@/services/reviews';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';

interface Props {
  visible: boolean;
  listingId: string | null;
  listingTitle?: string;
  onClose: () => void;
  /** null = vendue en dehors de l'application, donc sans avis possible. */
  onConfirm: (buyerId: string | null) => void;
}

/**
 * Désigne l'acheteur au moment de conclure une vente : c'est ce qui rend les
 * avis possibles entre les deux parties.
 */
export function BuyerPicker({ visible, listingId, listingTitle, onClose, onConfirm }: Props) {
  const { userById } = useAuth();
  const [buyerIds, setBuyerIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !listingId) return;
    setLoading(true);
    setSelected(null);
    fetchInterestedBuyers(listingId)
      .then(setBuyerIds)
      .catch(() => setBuyerIds([]))
      .finally(() => setLoading(false));
  }, [listingId, visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={onClose} accessibilityLabel="Fermer" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>À qui l’avez-vous vendu ?</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {listingTitle} — le désigner vous permettra de vous noter mutuellement.
          </Text>

          {loading ? (
            <ActivityIndicator style={styles.loader} color={colors.primary} />
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {buyerIds.length === 0 ? (
                <Text style={styles.empty}>
                  Personne ne vous a contacté via l’application pour cette annonce.
                </Text>
              ) : (
                buyerIds.map((id) => {
                  const buyer = userById(id);
                  const active = selected === id;
                  return (
                    <Pressable
                      key={id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      onPress={() => setSelected(id)}
                      style={[styles.row, active && styles.rowActive]}
                    >
                      <Avatar name={buyer?.name ?? '?'} color={buyer?.avatarColor} size={40} />
                      <View style={styles.rowText}>
                        <Text style={styles.name}>{buyer?.name ?? 'Membre'}</Text>
                        {buyer?.city ? <Text style={styles.city}>{buyer.city}</Text> : null}
                      </View>
                      <MaterialCommunityIcons
                        name={active ? 'radiobox-marked' : 'radiobox-blank'}
                        size={20}
                        color={active ? colors.primary : colors.borderStrong}
                      />
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          )}

          <View style={styles.actions}>
            <Button
              label="Vendue ailleurs"
              variant="secondary"
              onPress={() => onConfirm(null)}
              style={styles.action}
            />
            <Button
              label="Confirmer"
              onPress={() => onConfirm(selected)}
              disabled={!selected}
              style={styles.action}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  backdropTouch: { flex: 1 },
  sheet: {
    maxHeight: '80%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13.5, color: colors.textMuted, marginTop: 4, lineHeight: 19 },
  loader: { marginVertical: spacing.xl },
  list: { marginTop: spacing.lg },
  listContent: { gap: spacing.sm, paddingBottom: spacing.md },
  empty: { fontSize: 14, color: colors.textFaint, lineHeight: 20, paddingVertical: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  rowText: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  city: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  action: { flex: 1, paddingHorizontal: spacing.md },
});
