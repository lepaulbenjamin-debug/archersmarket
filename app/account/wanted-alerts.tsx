import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Header, Screen } from '@/components/Screen';
import { categories } from '@/data/catalog';
import { fetchWatch, setWatch, stopWatching } from '@/services/wanted';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import type { CategoryId } from '@/types';

/**
 * Savoir ce que les autres cherchent.
 *
 * Le réglage qui décide si la fonctionnalité est utile ou insupportable. Le
 * groupe Facebook supporte tout parce qu'on le déroule quand on veut ; une
 * notification par demande, envoyée à tout le monde, viderait l'application
 * en une semaine dès qu'il y aura du volume.
 *
 * D'où le choix par catégorie. « Toutes » reste possible — c'est le mode du
 * groupe Facebook, et il a ses partisans — mais c'est un choix, pas le
 * réglage par défaut qu'on subit.
 */
export default function WantedAlertsScreen() {
  const { user } = useAuth();

  const [actif, setActif] = useState(false);
  const [choisies, setChoisies] = useState<CategoryId[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enregistre, setEnregistre] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!user) return;
    try {
      const preference = await fetchWatch(user.id);
      setActif(preference !== null);
      setChoisies(preference?.categories ?? []);
    } catch (err) {
      Alert.alert('Chargement impossible', (err as Error).message);
    } finally {
      setChargement(false);
    }
  }, [user]);

  useEffect(() => {
    charger();
  }, [charger]);

  const basculer = (id: CategoryId) =>
    setChoisies((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const enregistrer = async () => {
    if (!user) return;
    setEnregistre(true);
    setMessage(null);
    try {
      if (actif) await setWatch(user.id, choisies);
      else await stopWatching(user.id);
      setMessage(
        actif
          ? choisies.length === 0
            ? 'C’est noté : vous serez prévenu de toutes les recherches.'
            : `C’est noté : ${choisies.length} catégorie${choisies.length > 1 ? 's' : ''} suivie${choisies.length > 1 ? 's' : ''}.`
          : 'Vous ne recevrez plus de notification de recherche.',
      );
    } catch (err) {
      Alert.alert('Enregistrement impossible', (err as Error).message);
    } finally {
      setEnregistre(false);
    }
  };

  if (chargement) {
    return (
      <Screen>
        <Header title="Ce qu’on cherche" showBack />
        <View style={styles.centre}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Ce qu’on cherche" showBack />
      <ScrollView contentContainerStyle={styles.contenu} showsVerticalScrollIndicator={false}>
        <View style={styles.encart}>
          <MaterialCommunityIcons name="bell-ring-outline" size={28} color={colors.primary} />
          <Text style={styles.encartTitre}>Être prévenu des recherches</Text>
          <Text style={styles.encartTexte}>
            Quand un archer publie une demande, vous recevez une notification. C’est ainsi qu’on
            vend ce qui dort dans un placard sans savoir que quelqu’un le cherche.
          </Text>
        </View>

        <View style={styles.bascule}>
          <Text style={styles.basculeTexte}>Recevoir les recherches</Text>
          <Switch
            value={actif}
            onValueChange={setActif}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
            thumbColor={colors.surface}
          />
        </View>

        {actif ? (
          <>
            <View>
              <Text style={styles.etiquette}>Quelles catégories</Text>
              <Text style={styles.aide}>
                Ne cochez rien pour tout recevoir. Sinon, seules les catégories choisies vous
                réveilleront.
              </Text>
              <View style={styles.pastilles}>
                {categories.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.short}
                    icon={c.icon}
                    selected={choisies.includes(c.id)}
                    onPress={() => basculer(c.id)}
                  />
                ))}
              </View>
            </View>

            {choisies.length > 0 ? (
              <Button
                label="Tout décocher, je veux tout voir"
                variant="ghost"
                size="sm"
                onPress={() => setChoisies([])}
              />
            ) : (
              <View style={styles.note}>
                <MaterialCommunityIcons
                  name="information-outline"
                  size={16}
                  color={colors.textMuted}
                />
                <Text style={styles.noteTexte}>
                  Aucune catégorie cochée : vous recevrez toutes les recherches, comme dans un
                  groupe de petites annonces.
                </Text>
              </View>
            )}
          </>
        ) : null}

        {message ? <Text style={styles.succes}>{message}</Text> : null}

        <Button
          label="Enregistrer"
          icon="check"
          onPress={enregistrer}
          loading={enregistre}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  contenu: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  encart: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.xl,
  },
  encartTitre: { fontSize: 18, fontWeight: '800', color: colors.text },
  encartTexte: { fontSize: 13.5, color: colors.textMuted, lineHeight: 19, textAlign: 'center' },
  bascule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  basculeTexte: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  etiquette: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  aide: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: spacing.md },
  pastilles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  noteTexte: { flex: 1, fontSize: 12.5, color: colors.textMuted, lineHeight: 18 },
  succes: { fontSize: 13.5, fontWeight: '600', color: colors.success, textAlign: 'center' },
});
