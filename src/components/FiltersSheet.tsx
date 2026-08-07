import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { brands, conditions, handednessOptions, sortOptions } from '@/data/catalog';
import { colors, radius, spacing } from '@/theme';
import type { ConditionId, Handedness, ListingFilters, SortOption } from '@/types';

interface Props {
  visible: boolean;
  filters: ListingFilters;
  onClose: () => void;
  onApply: (filters: ListingFilters) => void;
}

const parseNumber = (value: string): number | undefined => {
  const parsed = Number(value.replace(',', '.'));
  return value.trim() === '' || Number.isNaN(parsed) ? undefined : parsed;
};

export function FiltersSheet({ visible, filters, onClose, onApply }: Props) {
  const [draft, setDraft] = useState<ListingFilters>(filters);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minWeight, setMinWeight] = useState('');
  const [maxWeight, setMaxWeight] = useState('');

  useEffect(() => {
    if (!visible) return;
    setDraft(filters);
    setMinPrice(filters.minPrice?.toString() ?? '');
    setMaxPrice(filters.maxPrice?.toString() ?? '');
    setMinWeight(filters.minDrawWeight?.toString() ?? '');
    setMaxWeight(filters.maxDrawWeight?.toString() ?? '');
  }, [filters, visible]);

  const toggleCondition = (id: ConditionId) =>
    setDraft((prev) => {
      const current = prev.conditions ?? [];
      return {
        ...prev,
        conditions: current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
      };
    });

  const toggleBrand = (brand: string) =>
    setDraft((prev) => {
      const current = prev.brands ?? [];
      return {
        ...prev,
        brands: current.includes(brand) ? current.filter((b) => b !== brand) : [...current, brand],
      };
    });

  const reset = () => {
    setDraft({ sort: 'recent', categories: draft.categories });
    setMinPrice('');
    setMaxPrice('');
    setMinWeight('');
    setMaxWeight('');
  };

  const apply = () =>
    onApply({
      ...draft,
      minPrice: parseNumber(minPrice),
      maxPrice: parseNumber(maxPrice),
      minDrawWeight: parseNumber(minWeight),
      maxDrawWeight: parseNumber(maxWeight),
    });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={onClose} accessibilityLabel="Fermer" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Filtres</Text>
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            <Group title="Trier par">
              <View style={styles.wrap}>
                {sortOptions.map((option) => (
                  <Chip
                    key={option.id}
                    label={option.label}
                    selected={(draft.sort ?? 'recent') === option.id}
                    onPress={() => setDraft((prev) => ({ ...prev, sort: option.id as SortOption }))}
                  />
                ))}
              </View>
            </Group>

            <Group title="État">
              <View style={styles.wrap}>
                {conditions.map((condition) => (
                  <Chip
                    key={condition.id}
                    label={condition.label}
                    selected={(draft.conditions ?? []).includes(condition.id)}
                    onPress={() => toggleCondition(condition.id)}
                  />
                ))}
              </View>
            </Group>

            <Group title="Main d’arc">
              <View style={styles.wrap}>
                {handednessOptions.map((option) => (
                  <Chip
                    key={option.id}
                    label={option.label}
                    selected={(draft.handedness ?? 'na') === option.id}
                    onPress={() =>
                      setDraft((prev) => ({ ...prev, handedness: option.id as Handedness }))
                    }
                  />
                ))}
              </View>
            </Group>

            <Group title="Prix (€)">
              <View style={styles.rangeRow}>
                <RangeInput placeholder="Min" value={minPrice} onChangeText={setMinPrice} />
                <Text style={styles.rangeSeparator}>—</Text>
                <RangeInput placeholder="Max" value={maxPrice} onChangeText={setMaxPrice} />
              </View>
            </Group>

            <Group title="Puissance (livres)" hint="S’applique aux arcs et aux branches.">
              <View style={styles.rangeRow}>
                <RangeInput placeholder="Min" value={minWeight} onChangeText={setMinWeight} />
                <Text style={styles.rangeSeparator}>—</Text>
                <RangeInput placeholder="Max" value={maxWeight} onChangeText={setMaxWeight} />
              </View>
            </Group>

            <Group title="Marques">
              <View style={styles.wrap}>
                {brands.map((brand) => (
                  <Chip
                    key={brand}
                    label={brand}
                    selected={(draft.brands ?? []).includes(brand)}
                    onPress={() => toggleBrand(brand)}
                  />
                ))}
              </View>
            </Group>

            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.switchLabel}>Envoi possible uniquement</Text>
                <Text style={styles.switchHint}>Masque les annonces à retirer sur place.</Text>
              </View>
              <Switch
                value={!!draft.shippingOnly}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, shippingOnly: value }))}
                trackColor={{ true: colors.primaryDark, false: colors.borderStrong }}
                thumbColor={colors.surface}
              />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Button label="Réinitialiser" variant="secondary" onPress={reset} style={styles.footerButton} />
            <Button label="Voir les résultats" onPress={apply} style={styles.footerButton} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {hint ? <Text style={styles.groupHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function RangeInput({
  placeholder,
  value,
  onChangeText,
}: {
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <TextInput
      accessibilityLabel={placeholder}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      value={value}
      onChangeText={onChangeText}
      keyboardType="numeric"
      style={styles.rangeInput}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  backdropTouch: { flex: 1 },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.xl },
  group: { gap: spacing.sm },
  groupTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  groupHint: { fontSize: 12, color: colors.textFaint, marginTop: -4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rangeSeparator: { color: colors.textFaint },
  rangeInput: {
    flex: 1,
    // Sans minWidth, la largeur intrinsèque du champ empêche le rétrécissement.
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  switchText: { flex: 1 },
  switchLabel: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  switchHint: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerButton: { flex: 1, paddingHorizontal: spacing.md },
});
