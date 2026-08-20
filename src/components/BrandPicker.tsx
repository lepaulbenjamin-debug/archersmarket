import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { brands } from '@/data/catalog';
import { colors, radius, spacing } from '@/theme';

const normalise = (texte: string) =>
  texte.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Choix de la marque parmi une longue liste.
 *
 * Soixante-dix-huit marques en pastilles feraient un mur de vingt lignes. On
 * n'en montre donc qu'une poignée, et une recherche ouvre le reste : taper
 * « uu » suffit à trouver Uukha, sans avoir à connaître l'orthographe exacte
 * ni à faire défiler.
 */
export function BrandPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (brand: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [ouvert, setOuvert] = useState(false);

  const resultats = useMemo(() => {
    const q = normalise(query.trim());
    if (!q) return [];
    return brands.filter((marque) => normalise(marque).includes(q)).slice(0, 24);
  }, [query]);

  // Sans recherche, on montre les plus courantes plus celle déjà choisie —
  // qui ne doit jamais disparaître de l'écran.
  const courantes = useMemo(() => {
    const tete = brands.slice(0, 11);
    return tete.includes(value) ? tete : [value, ...tete.slice(0, 10)];
  }, [value]);

  const visibles = query.trim() ? resultats : ouvert ? brands : courantes;

  return (
    <View style={styles.bloc}>
      <View style={styles.recherche}>
        <MaterialCommunityIcons name="magnify" size={17} color={colors.textFaint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher une marque…"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.champ}
        />
        {query ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Effacer la recherche"
            hitSlop={8}
            onPress={() => setQuery('')}
          >
            <MaterialCommunityIcons name="close-circle" size={16} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>

      {query.trim() && resultats.length === 0 ? (
        <Text style={styles.vide}>
          Aucune marque ne correspond. Choisissez « Autre » et précisez-la dans le titre.
        </Text>
      ) : null}

      <ScrollView
        style={ouvert && !query.trim() ? styles.liste : undefined}
        contentContainerStyle={styles.pastilles}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {visibles.map((marque) => (
          <Chip
            key={marque}
            label={marque}
            selected={value === marque}
            onPress={() => {
              onChange(marque);
              setQuery('');
            }}
          />
        ))}
      </ScrollView>

      {!query.trim() ? (
        <Pressable accessibilityRole="button" onPress={() => setOuvert((o) => !o)} hitSlop={6}>
          <Text style={styles.bascule}>
            {ouvert ? 'Réduire la liste' : `Voir les ${brands.length} marques`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { gap: spacing.sm },
  recherche: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 42,
  },
  champ: { flex: 1, fontSize: 14.5, color: colors.text, padding: 0 },
  pastilles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  liste: { maxHeight: 220 },
  vide: { fontSize: 12.5, color: colors.textFaint, lineHeight: 17 },
  bascule: { fontSize: 13, fontWeight: '700', color: colors.primary, paddingVertical: 2 },
});
