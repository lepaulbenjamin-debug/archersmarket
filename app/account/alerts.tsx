import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { Header, Screen } from '@/components/Screen';
import {
  deleteSavedSearch, describeFilters, fetchSavedSearches, setSavedSearchNotify,
  type SavedSearch,
} from '@/services/savedSearches';
import { usePush } from '@/store/PushContext';
import { colors, radius, spacing } from '@/theme';
import { formatRelativeDate } from '@/utils/format';

/**
 * Les alertes du membre.
 *
 * Chacune peut être mise en veille sans être supprimée : on cherche une
 * poignée pendant trois semaines, on la trouve, et on ne veut plus être
 * dérangé — sans pour autant refaire les critères le jour où l'on en
 * cherchera une autre.
 */
export default function AlertsScreen() {
  const router = useRouter();
  const { enabled: pushEnabled, unavailable: pushUnavailable } = usePush();

  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSearches(await fetchSavedSearches());
    } catch (error) {
      Alert.alert('Alertes indisponibles', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const basculer = async (search: SavedSearch, notify: boolean) => {
    setBusy(search.id);
    // On met à jour l'écran tout de suite : un interrupteur qui attend le
    // réseau donne l'impression de ne pas répondre.
    setSearches((prev) => prev.map((s) => (s.id === search.id ? { ...s, notify } : s)));
    try {
      await setSavedSearchNotify(search.id, notify);
    } catch (error) {
      setSearches((prev) => prev.map((s) => (s.id === search.id ? { ...s, notify: !notify } : s)));
      Alert.alert('Mise à jour impossible', (error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const supprimer = (search: SavedSearch) =>
    Alert.alert('Supprimer l’alerte', `« ${search.label} » ne vous préviendra plus.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSavedSearch(search.id);
            setSearches((prev) => prev.filter((s) => s.id !== search.id));
          } catch (error) {
            Alert.alert('Suppression impossible', (error as Error).message);
          }
        },
      },
    ]);

  return (
    <Screen>
      <Header title="Mes alertes" subtitle="Être prévenu des nouvelles annonces" showBack />

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : searches.length === 0 ? (
        <EmptyState
          icon="bell-outline"
          title="Aucune alerte"
          description="Faites une recherche, puis touchez « Me prévenir des nouveautés » pour être averti dès qu’une annonce y correspond."
          actionLabel="Rechercher"
          onAction={() => router.push('/(tabs)')}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Une alerte active dont les notifications sont coupées ne sonnera
              jamais. Le dire ici évite d'attendre en vain. */}
          {!pushEnabled ? (
            <View style={styles.avertissement}>
              <MaterialCommunityIcons name="bell-off-outline" size={18} color={colors.danger} />
              <Text style={styles.avertissementTexte}>
                {pushUnavailable ??
                  'Les notifications sont désactivées : vos alertes ne vous préviendront pas.'}
              </Text>
            </View>
          ) : null}

          {searches.map((search) => (
            <View key={search.id} style={styles.card}>
              <View style={styles.ligne}>
                <View style={styles.flex}>
                  <Text style={styles.label}>{search.label}</Text>
                  <Text style={styles.criteres} numberOfLines={2}>
                    {describeFilters(search.filters)}
                  </Text>
                  <Text style={styles.meta}>
                    {search.lastNotifiedAt
                      ? `Dernière alerte ${formatRelativeDate(search.lastNotifiedAt)}`
                      : 'Aucune annonce correspondante pour l’instant'}
                  </Text>
                </View>
                <Switch
                  value={search.notify}
                  disabled={busy === search.id}
                  onValueChange={(valeur) => basculer(search, valeur)}
                  trackColor={{ true: colors.primaryDark, false: colors.borderStrong }}
                  thumbColor={colors.surface}
                />
              </View>

              <Pressable accessibilityRole="button" onPress={() => supprimer(search)} hitSlop={6}>
                <Text style={styles.supprimer}>Supprimer</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loader: { marginTop: spacing.xxl },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  avertissement: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  avertissementTexte: { flex: 1, fontSize: 12.5, color: colors.danger, lineHeight: 18 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { fontSize: 15, fontWeight: '700', color: colors.text },
  criteres: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  meta: { fontSize: 11.5, color: colors.textFaint, marginTop: 3 },
  supprimer: { fontSize: 12.5, fontWeight: '700', color: colors.danger },
});
