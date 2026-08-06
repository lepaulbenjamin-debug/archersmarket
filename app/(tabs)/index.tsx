import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { FiltersSheet } from '@/components/FiltersSheet';
import { ListingGrid } from '@/components/ListingGrid';
import { Logo } from '@/components/Logo';
import { SearchField } from '@/components/SearchField';
import { Screen } from '@/components/Screen';
import { categories, sortOptions } from '@/data/catalog';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';
import type { CategoryId, ListingFilters } from '@/types';

export default function BrowseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; q?: string }>();
  const { user } = useAuth();
  const { search, isFavorite, toggleFavorite, loading, error, refresh } = useListings();

  const [query, setQuery] = useState(params.q ?? '');
  const [filters, setFilters] = useState<ListingFilters>({ sort: 'recent' });
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (params.category) {
      setFilters((prev) => ({ ...prev, categories: [params.category as CategoryId] }));
    }
  }, [params.category]);

  const selectedCategories = filters.categories ?? [];
  const results = useMemo(() => search({ ...filters, query }), [filters, query, search]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.conditions?.length) count += 1;
    if (filters.brands?.length) count += 1;
    if (filters.handedness && filters.handedness !== 'na') count += 1;
    if (filters.minPrice != null || filters.maxPrice != null) count += 1;
    if (filters.minDrawWeight != null || filters.maxDrawWeight != null) count += 1;
    if (filters.shippingOnly) count += 1;
    return count;
  }, [filters]);

  const toggleCategory = (id: CategoryId) =>
    setFilters((prev) => {
      const current = prev.categories ?? [];
      return {
        ...prev,
        categories: current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
      };
    });

  const handleFavorite = (id: string) => {
    if (!user) {
      router.push('/login');
      return;
    }
    toggleFavorite(id);
  };

  const currentSort = sortOptions.find((o) => o.id === (filters.sort ?? 'recent'));

  return (
    <Screen>
      <View style={styles.brandBar}>
        <Logo size={34} wordSize={16} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mes favoris"
          onPress={() => router.push('/(tabs)/favorites')}
          hitSlop={8}
          style={styles.brandAction}
        >
          <MaterialCommunityIcons name="heart-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.searchBar}>
        <View style={styles.searchInput}>
          <SearchField value={query} onChangeText={setQuery} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filtres"
          onPress={() => setSheetOpen(true)}
          style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="tune-variant" size={20} color={colors.onPrimary} />
          {activeFilterCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        style={styles.chipsScroll}
      >
        {categories.map((category) => (
          <Chip
            key={category.id}
            label={category.short}
            icon={category.icon}
            selected={selectedCategories.includes(category.id)}
            onPress={() => toggleCategory(category.id)}
          />
        ))}
      </ScrollView>

      <View style={styles.resultsHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Changer le tri"
          onPress={() => setSheetOpen(true)}
          style={({ pressed }) => [styles.sortButton, pressed && styles.pressed]}
        >
          <Text style={styles.sortLabel}>Tri : {currentSort?.label.toLowerCase()}</Text>
          <MaterialCommunityIcons name="chevron-down" size={16} color={colors.text} />
        </Pressable>
        <Text style={styles.resultsCount}>
          {results.length} annonce{results.length > 1 ? 's' : ''}
        </Text>
      </View>

      {error ? (
        <Pressable
          accessibilityRole="button"
          onPress={refresh}
          style={({ pressed }) => [styles.errorBanner, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="cloud-off-outline" size={18} color={colors.danger} />
          <View style={styles.errorText}>
            <Text style={styles.errorTitle}>Connexion au serveur impossible</Text>
            <Text style={styles.errorDetail} numberOfLines={3}>
              {error} — toucher pour réessayer.
            </Text>
          </View>
        </Pressable>
      ) : null}

      {loading ? <ActivityIndicator style={styles.loader} color={colors.primary} /> : null}

      <ListingGrid
        listings={results}
        isFavorite={isFavorite}
        onToggleFavorite={handleFavorite}
        empty={
          loading || error ? undefined : (
            <EmptyState
              icon="bullseye-arrow"
              title="Aucune annonce ne correspond"
              description="Essayez d’élargir vos filtres ou de changer de mot-clé."
              actionLabel="Réinitialiser les filtres"
              onAction={() => {
                setFilters({ sort: 'recent' });
                setQuery('');
              }}
            />
          )
        }
      />

      <FiltersSheet
        visible={sheetOpen}
        filters={filters}
        onClose={() => setSheetOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  brandAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  searchInput: { flex: 1 },
  filterButton: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: { fontSize: 10.5, fontWeight: '800', color: colors.onDark },
  // Hauteur explicite : dans un conteneur en colonne, un ScrollView horizontal
  // se replie sinon sur une fraction de la hauteur des chips.
  chipsScroll: { flexGrow: 0, flexShrink: 0, height: 40, marginTop: spacing.md },
  chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'center' },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  sortLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  resultsCount: { fontSize: 13, fontWeight: '600', color: colors.textFaint },
  loader: { marginTop: spacing.xl },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  errorText: { flex: 1 },
  errorTitle: { fontSize: 13.5, fontWeight: '700', color: colors.danger },
  errorDetail: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  pressed: { opacity: 0.85 },
});
