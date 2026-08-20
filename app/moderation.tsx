import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';

import { Header, Screen } from '@/components/Screen';
import {
  fetchFlaggedAccounts, fetchPendingReports, fetchSignals, resolveReport,
  restoreAccount, riskLabel, suspendAccount,
  type FlaggedAccount, type ModerationReport, type RiskSignal,
} from '@/services/moderation';
import { useAuth } from '@/store/AuthContext';
import { colors, radius, spacing } from '@/theme';
import { formatRelativeDate } from '@/utils/format';

/**
 * La file de modération.
 *
 * Un dispositif de surveillance que personne ne lit ne protège personne :
 * jusqu'ici, un signalement de membre tombait dans une table sans
 * destinataire. C'est ici qu'un humain décide — rien n'est jamais suspendu
 * automatiquement.
 */
export default function ModerationScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [accounts, setAccounts] = useState<FlaggedAccount[]>([]);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [detail, setDetail] = useState<Record<string, RiskSignal[]>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [comptes, signalements] = await Promise.all([
        fetchFlaggedAccounts(),
        fetchPendingReports(),
      ]);
      setAccounts(comptes);
      setReports(signalements);
    } catch (error) {
      Alert.alert('Chargement impossible', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!user?.isModerator) {
    return (
      <Screen>
        <Header title="Modération" showBack />
        <Text style={styles.absent}>Cette page ne vous est pas destinée.</Text>
      </Screen>
    );
  }

  const ouvrir = async (compte: FlaggedAccount) => {
    if (open === compte.userId) {
      setOpen(null);
      return;
    }
    setOpen(compte.userId);
    if (detail[compte.userId]) return;
    try {
      setDetail((prev) => ({ ...prev, [compte.userId]: [] }));
      const signaux = await fetchSignals(compte.userId);
      setDetail((prev) => ({ ...prev, [compte.userId]: signaux }));
    } catch (error) {
      Alert.alert('Détail indisponible', (error as Error).message);
    }
  };

  const agir = async (action: () => Promise<void>, echec: string) => {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (error) {
      Alert.alert(echec, (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const suspendre = (compte: FlaggedAccount) =>
    Alert.alert(
      `Suspendre ${compte.name} ?`,
      'Ses annonces sortent de la vente et il ne pourra plus publier ni écrire. Rien n’est effacé : la décision se lève à tout moment.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Suspendre',
          style: 'destructive',
          onPress: () =>
            agir(
              () => suspendAccount(compte.userId, `Signaux : ${compte.kinds.map(riskLabel).join(', ')}`),
              'Suspension impossible',
            ),
        },
      ],
    );

  return (
    <Screen>
      <Header
        title="Modération"
        subtitle={`${accounts.length} compte(s) · ${reports.length} signalement(s)`}
        showBack
      />
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.section}>Comptes qui remontent</Text>
          {accounts.length === 0 ? (
            <Text style={styles.vide}>Rien à examiner. C’est bon signe.</Text>
          ) : (
            accounts.map((compte) => (
              <View key={compte.userId} style={styles.card}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => ouvrir(compte)}
                  style={styles.row}
                >
                  <View style={[styles.poids, compte.recentWeight >= 100 && styles.poidsFort]}>
                    <Text style={styles.poidsText}>{compte.recentWeight}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.nom}>{compte.name}</Text>
                    <Text style={styles.meta}>
                      {compte.kinds.map(riskLabel).join(' · ')}
                      {compte.reports > 0 ? ` · ${compte.reports} signalement(s)` : ''}
                    </Text>
                    <Text style={styles.metaFaible}>
                      {compte.recentSignals} signal(aux)
                      {compte.lastSignalAt
                        ? ` · dernier ${formatRelativeDate(compte.lastSignalAt)}`
                        : ''}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name={open === compte.userId ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.textFaint}
                  />
                </Pressable>

                {open === compte.userId ? (
                  <View style={styles.detail}>
                    {(detail[compte.userId] ?? []).map((signal) => (
                      <View key={signal.id} style={styles.signal}>
                        <Text style={styles.signalTitre}>
                          {riskLabel(signal.kind)} · {signal.weight}
                        </Text>
                        {signal.detail ? (
                          <Text style={styles.signalMotif}>{signal.detail}</Text>
                        ) : null}
                        {signal.messageBody ? (
                          <Text style={styles.signalMessage}>« {signal.messageBody} »</Text>
                        ) : null}
                      </View>
                    ))}
                    <View style={styles.actions}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => router.push(`/seller/${compte.userId}`)}
                        style={styles.action}
                      >
                        <Text style={styles.actionText}>Voir le profil</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() =>
                          agir(() => restoreAccount(compte.userId), 'Rétablissement impossible')
                        }
                        style={styles.action}
                      >
                        <Text style={styles.actionText}>Rétablir</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => suspendre(compte)}
                        style={[styles.action, styles.actionDanger]}
                      >
                        <Text style={[styles.actionText, styles.actionTextDanger]}>Suspendre</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            ))
          )}

          <Text style={styles.section}>Signalements en attente</Text>
          {reports.length === 0 ? (
            <Text style={styles.vide}>Aucun signalement à traiter.</Text>
          ) : (
            reports.map((signalement) => (
              <View key={signalement.id} style={styles.card}>
                <Text style={styles.nom}>{signalement.reason}</Text>
                {signalement.details ? (
                  <Text style={styles.signalMessage}>« {signalement.details} »</Text>
                ) : null}
                <Text style={styles.metaFaible}>
                  {formatRelativeDate(signalement.createdAt)}
                </Text>
                <View style={styles.actions}>
                  {signalement.targetProfileId ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.push(`/seller/${signalement.targetProfileId}`)}
                      style={styles.action}
                    >
                      <Text style={styles.actionText}>Voir le membre</Text>
                    </Pressable>
                  ) : null}
                  {signalement.targetListingId ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.push(`/listing/${signalement.targetListingId}`)}
                      style={styles.action}
                    >
                      <Text style={styles.actionText}>Voir l’annonce</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() =>
                      agir(() => resolveReport(signalement.id, 'Examiné'), 'Clôture impossible')
                    }
                    style={styles.action}
                  >
                    <Text style={styles.actionText}>Classer</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loader: { marginTop: spacing.xxl },
  absent: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxl, paddingHorizontal: spacing.xl },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  section: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: spacing.lg },
  vide: { fontSize: 13, color: colors.textFaint },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  poids: {
    minWidth: 40, paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, alignItems: 'center',
  },
  poidsFort: { backgroundColor: colors.dangerSoft },
  poidsText: { fontSize: 14, fontWeight: '800', color: colors.text },
  nom: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  metaFaible: { fontSize: 11, color: colors.textFaint, marginTop: 1 },
  detail: { gap: spacing.sm, marginTop: spacing.sm },
  signal: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 3,
  },
  signalTitre: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  signalMotif: { fontSize: 12, color: colors.textMuted },
  signalMessage: { fontSize: 12.5, color: colors.text, fontStyle: 'italic', lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  action: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  actionDanger: { borderColor: colors.danger },
  actionText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  actionTextDanger: { color: colors.danger },
});
