import React, { useMemo } from 'react';
import { FlatList, StyleSheet, View, ViewStyle } from 'react-native';

import { ListingCard } from '@/components/ListingCard';
import { spacing } from '@/theme';
import type { Listing } from '@/types';

interface Props {
  listings: Listing[];
  isFavorite?: (id: string) => boolean;
  onToggleFavorite?: (id: string) => void;
  header?: React.ReactElement;
  empty?: React.ReactElement;
  scrollEnabled?: boolean;
  contentContainerStyle?: ViewStyle;
}

/**
 * Grille à deux colonnes. Les emplacements manquants de la dernière ligne sont
 * comblés par des cases vides, sinon une tuile seule s'étire sur toute la largeur.
 */
export function ListingGrid({
  listings,
  isFavorite,
  onToggleFavorite,
  header,
  empty,
  scrollEnabled = true,
  contentContainerStyle,
}: Props) {
  const data = useMemo<Array<Listing | null>>(
    () => (listings.length % 2 === 0 ? listings : [...listings, null]),
    [listings],
  );

  // Rendu direct plutôt que ListEmptyComponent : avec numColumns, la FlatList
  // n'affiche pas son composant de liste vide.
  if (listings.length === 0 && (header || empty)) {
    return (
      <View style={styles.emptyWrap}>
        {header}
        {empty}
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item, index) => item?.id ?? `spacer-${index}`}
      numColumns={2}
      scrollEnabled={scrollEnabled}
      columnWrapperStyle={styles.row}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={header}
      renderItem={({ item }) =>
        item ? (
          <ListingCard
            listing={item}
            isFavorite={isFavorite?.(item.id)}
            onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(item.id) : undefined}
          />
        ) : (
          <View style={styles.spacer} />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.md },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  spacer: { flex: 1 },
  emptyWrap: { paddingHorizontal: spacing.lg },
});
