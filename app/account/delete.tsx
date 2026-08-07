import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Header, Screen } from '@/components/Screen';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';

/** Recopier ce mot évite la suppression par inadvertance. */
const CONFIRMATION = 'SUPPRIMER';

const CONSEQUENCES = [
  { icon: 'tag-off-outline', label: 'Vos annonces et leurs photos' },
  { icon: 'message-off-outline', label: 'Vos conversations et vos messages' },
  { icon: 'heart-off-outline', label: 'Vos favoris' },
  { icon: 'star-off', label: 'Les avis que vous avez reçus et déposés' },
] as const;

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { user, deleteAccount } = useAuth();
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);

  const armed = typed.trim().toUpperCase() === CONFIRMATION;

  const confirm = () => {
    Alert.alert(
      'Supprimer définitivement ?',
      'Cette action est irréversible. Aucune sauvegarde ne permet de revenir en arrière.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: run },
      ],
    );
  };

  const run = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      router.replace('/(tabs)');
      Alert.alert('Compte supprimé', 'Vos données ont été effacées. Merci d’être passé par ici.');
    } catch (error) {
      setDeleting(false);
      Alert.alert('Suppression impossible', (error as Error).message);
    }
  };

  if (!user) {
    return (
      <Screen>
        <Header title="Supprimer mon compte" showBack />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Supprimer mon compte" showBack />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.warning}>
            <MaterialCommunityIcons name="alert-outline" size={20} color={colors.danger} />
            <Text style={styles.warningText}>
              La suppression est immédiate et définitive. Il n’existe aucun moyen de récupérer le
              compte @{user.handle} ni ce qu’il contient.
            </Text>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Ce qui sera effacé</Text>
            {CONSEQUENCES.map((item) => (
              <View key={item.label} style={styles.row}>
                <MaterialCommunityIcons name={item.icon} size={17} color={colors.textMuted} />
                <Text style={styles.rowLabel}>{item.label}</Text>
              </View>
            ))}
            <Text style={styles.note}>
              Les avis que vous avez déposés disparaissent aussi : la note des personnes concernées
              est recalculée sans eux.
            </Text>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Une vente est en cours ?</Text>
            <Text style={styles.note}>
              Prévenez votre acheteur ou votre vendeur avant de supprimer : vos échanges seront
              effacés de son côté comme du vôtre, et vous n’aurez plus aucun moyen de le joindre.
            </Text>
          </View>

          <Field
            label={`Tapez ${CONFIRMATION} pour confirmer`}
            placeholder={CONFIRMATION}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <Button
            label="Supprimer définitivement mon compte"
            icon="trash-can-outline"
            variant="danger"
            disabled={!armed}
            loading={deleting}
            onPress={confirm}
          />
          <Button label="Annuler" variant="ghost" onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  warning: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  warningText: { flex: 1, fontSize: 13, color: colors.danger, lineHeight: 18, fontWeight: '600' },
  block: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  blockTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLabel: { flex: 1, fontSize: 13.5, color: colors.textMuted },
  note: { fontSize: 12.5, color: colors.textFaint, lineHeight: 17 },
});
