import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { reportReasons } from '@/data/catalog';
import { createReport } from '@/services/reports';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import type { ReportReason } from '@/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Une cible et une seule. */
  listingId?: string;
  profileId?: string;
  /** Intitulé de la cible, rappelé en tête du formulaire. */
  subject: string;
}

export function ReportSheet({ visible, onClose, listingId, profileId, subject }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetails('');
    }
  }, [visible]);

  const submit = async () => {
    if (!reason) return;
    if (!user) {
      onClose();
      router.push('/login');
      return;
    }
    setSubmitting(true);
    try {
      await createReport({ reporterId: user.id, reason, details, listingId, profileId });
      onClose();
      Alert.alert(
        'Signalement envoyé',
        'Merci. Notre équipe examine chaque signalement et prendra les mesures nécessaires.',
      );
    } catch (error) {
      Alert.alert('Signalement non envoyé', (error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const selected = reportReasons.find((r) => r.id === reason);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={onClose} accessibilityLabel="Fermer" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>Signaler</Text>
                <Text style={styles.subject} numberOfLines={1}>
                  {subject}
                </Text>
              </View>
              <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
            >
              {reportReasons.map((item) => {
                const active = reason === item.id;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => setReason(item.id)}
                    style={[styles.reason, active && styles.reasonActive]}
                  >
                    <MaterialCommunityIcons
                      name={active ? 'radiobox-marked' : 'radiobox-blank'}
                      size={19}
                      color={active ? colors.primary : colors.borderStrong}
                    />
                    <View style={styles.reasonText}>
                      <Text style={styles.reasonLabel}>{item.label}</Text>
                      <Text style={styles.reasonHint}>{item.hint}</Text>
                    </View>
                  </Pressable>
                );
              })}

              <View style={styles.field}>
                <Text style={styles.label}>
                  Précisions {reason === 'other' ? '' : '(optionnel)'}
                </Text>
                <TextInput
                  accessibilityLabel="Précisions"
                  value={details}
                  onChangeText={setDetails}
                  placeholder={selected?.hint ?? 'Décrivez ce qui vous semble anormal…'}
                  placeholderTextColor={colors.textFaint}
                  multiline
                  numberOfLines={4}
                  maxLength={2000}
                  style={styles.textarea}
                />
              </View>

              <Text style={styles.notice}>
                Votre signalement est confidentiel : la personne concernée n’en est pas informée.
              </Text>
            </ScrollView>

            <Button
              label="Envoyer le signalement"
              icon="flag-outline"
              onPress={submit}
              loading={submitting}
              disabled={!reason || (reason === 'other' && details.trim().length < 3)}
              style={styles.submit}
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  backdropTouch: { flex: 1 },
  // La feuille ne doit jamais déborder du haut de l'écran : c'est la liste des
  // motifs qui défile.
  keyboardWrap: { maxHeight: '88%' },
  sheet: {
    flexShrink: 1,
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  headerText: { flex: 1 },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },
  subject: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  body: { gap: spacing.sm, paddingBottom: spacing.md },
  reason: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reasonActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  reasonText: { flex: 1, gap: 2 },
  reasonLabel: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  reasonHint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  field: { gap: 6, marginTop: spacing.sm },
  label: { fontSize: 13, fontWeight: '700', color: colors.text },
  textarea: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
  },
  notice: { fontSize: 12, color: colors.textFaint, lineHeight: 17 },
  submit: { marginTop: spacing.md },
});
