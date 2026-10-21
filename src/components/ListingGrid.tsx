import React, { useMemo } from 'react';
import { FlatList, Platform, StyleSheet, View, ViewStyle } from 'react-native';

import { ListingCard } from '@/components/ListingCard';
import { spacing } from '@/theme';
import { SITE_LARGE, useContentWidth } from '@/utils/site';
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
 * Combien de colonnes pour cette largeur.
 *
 * Sur téléphone, toujours deux : c'est la grille de l'application, et elle ne
 * change pas. Sur le site, une carte doit garder la taille qu'elle a dans la
 * main — autour de 220 px — plutôt que de s'étirer à 600 px sur un écran
 * d'ordinateur, où l'on verrait deux annonces à la fois.
 */
function colonnesPour(largeur: number): number {
  if (Platform.OS !== 'web') return 2;
  return Math.max(2, Math.min(5, Math.floor(largeur / 220)));
}

/**
 * Grille d'annonces. Les emplacements manquants de la dernière ligne sont
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
  const colonnes = colonnesPour(useContentWidth(SITE_LARGE));
  const data = useMemo<Array<Listing | null>>(() => {
    const manquants = (colonnes - (listings.length % colonnes)) % colonnes;
    return manquants ? [...listings, ...Array<null>(manquants).fill(null)] : listings;
  }, [listings, colonnes]);

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
      // Une FlatList ne sait pas changer de nombre de colonnes en place : on
      // la remonte quand la fenêtre change de palier.
      key={colonnes}
      data={data}
      keyExtractor={(item, index) => item?.id ?? `spacer-${index}`}
      numColumns={colonnes}
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
