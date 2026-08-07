import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ReportSheet } from '@/components/ReportSheet';
import { blockMember } from '@/services/blocks';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';

interface Props {
  memberId: string;
  memberName: string;
  /** Appelé une fois le blocage effectif : l'écran affiché n'a souvent plus lieu d'être. */
  onBlocked?: () => void;
}

/**
 * Signaler ou bloquer un membre. Les deux vont ensemble : signaler prévient la
 * modération, bloquer coupe le contact tout de suite sans rien attendre.
 */
export function MemberMenu({ memberId, memberName, onBlocked }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const { refresh } = useListings();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);

  if (!user || user.id === memberId) return null;

  const askBlock = () => {
    setOpen(false);
    Alert.alert(
      `Bloquer ${memberName} ?`,
      'Ses annonces disparaîtront de votre fil et vous ne pourrez plus vous écrire, ni l’un ni l’autre. Cette personne n’en sera pas informée. Vous pourrez la débloquer depuis votre compte.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Bloquer', style: 'destructive', onPress: block },
      ],
    );
  };

  const block = async () => {
    try {
      await blockMember(user.id, memberId);
      // Ses annonces sortent du fil : la base les masque, encore faut-il relire.
      await refresh();
      onBlocked ? onBlocked() : router.back();
    } catch (error) {
      Alert.alert('Blocage impossible', (error as Error).message);
    }
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Options pour ${memberName}`}
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={styles.trigger}
      >
        <MaterialCommunityIcons name="dots-horizontal" size={19} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.title} numberOfLines={1}>
              {memberName}
            </Text>
            <Action
              icon="flag-outline"
              label="Signaler ce membre"
              hint="Prévenir la modération d’un comportement ou d’une annonce."
              onPress={() => {
                setOpen(false);
                setReporting(true);
              }}
            />
            <Action
              icon="account-cancel-outline"
              label="Bloquer ce membre"
              hint="Couper le contact immédiatement, sans l’en informer."
              danger
              onPress={askBlock}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
            >
              <Text style={styles.cancelLabel}>Annuler</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ReportSheet
        visible={reporting}
        onClose={() => setReporting(false)}
        profileId={memberId}
        subject={memberName}
      />
    </>
  );
}

function Action({
  icon,
  label,
  hint,
  danger,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  hint: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={20}
        color={danger ? colors.danger : colors.textMuted}
      />
      <View style={styles.actionText}>
        <Text style={[styles.actionLabel, danger && styles.dangerLabel]}>{label}</Text>
        <Text style={styles.actionHint}>{hint}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textFaint,
    textAlign: 'center',
    paddingBottom: spacing.sm,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  actionText: { flex: 1 },
  actionLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  dangerLabel: { color: colors.danger },
  actionHint: { fontSize: 12, color: colors.textFaint, marginTop: 2, lineHeight: 16 },
  cancel: { paddingVertical: spacing.md, alignItems: 'center' },
  cancelLabel: { fontSize: 14.5, fontWeight: '700', color: colors.textMuted },
  pressed: { opacity: 0.7 },
});
