import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import type { OrderStatus } from '@/services/payments';

/** Chaque état a sa couleur : on doit lire une commande d'un coup d'œil. */
const TONE: Record<OrderStatus, { bg: string; fg: string; icon: string }> = {
  pending: { bg: colors.surfaceAlt, fg: colors.textMuted, icon: 'clock-outline' },
  paid: { bg: colors.primarySoft, fg: colors.primaryDark, icon: 'shield-check-outline' },
  shipped: { bg: colors.primarySoft, fg: colors.primaryDark, icon: 'truck-outline' },
  delivered: { bg: colors.successSoft, fg: colors.success, icon: 'package-variant-closed-check' },
  released: { bg: colors.successSoft, fg: colors.success, icon: 'check-circle-outline' },
  refunded: { bg: colors.surfaceAlt, fg: colors.textMuted, icon: 'cash-refund' },
  cancelled: { bg: colors.surfaceAlt, fg: colors.textFaint, icon: 'close-circle-outline' },
  disputed: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-outline' },
};

export function PaymentBadge({ status, label }: { status: OrderStatus; label: string }) {
  const tone = TONE[status];
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <MaterialCommunityIcons
        name={tone.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
        size={13}
        color={tone.fg}
      />
      <Text style={[styles.text, { color: tone.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  text: { fontSize: 12, fontWeight: '700' },
});
