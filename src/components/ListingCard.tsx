import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { conditionById, handednessLabel } from '@/data/catalog';
import { colors, radius, shadow, spacing } from '@/theme';
import type { Listing } from '@/types';
import { discountPercent, formatPrice, formatRelativeDate } from '@/utils/format';
import { imageSource } from '@/utils/images';

interface Props {
  listing: Listing;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** Carte pleine largeur (liste) plutôt que tuile de grille. */
  wide?: boolean;
}

export function ListingCard({ listing, isFavorite, onToggleFavorite, wide }: Props) {
  const router = useRouter();
  const discount = discountPercent(listing.price, listing.originalPrice);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${listing.title}, ${formatPrice(listing.price)}`}
      onPress={() => router.push(`/listing/${listing.id}`)}
      style={({ pressed }) => [styles.card, wide && styles.cardWide, pressed && styles.pressed]}
    >
      <View style={[styles.imageWrap, wide && styles.imageWrapWide]}>
        <Image
          source={imageSource(listing.images[0], listing.category)}
          style={styles.image}
          contentFit="cover"
          transition={160}
        />

        <View style={styles.topBadges}>
          {listing.status !== 'active' ? (
            <View style={[styles.badge, listing.status === 'sold' ? styles.badgeSold : styles.badgeReserved]}>
              <Text style={styles.badgeText}>
                {listing.status === 'sold' ? 'Vendu' : 'Réservé'}
              </Text>
            </View>
          ) : (
            <View style={styles.badge}>
              <Text style={styles.badgeText} numberOfLines={1}>
                {listing.handedness === 'na' ? 'Droitier/Gaucher' : handednessLabel(listing.handedness)}
              </Text>
            </View>
          )}
        </View>

        {onToggleFavorite ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            hitSlop={8}
            onPress={onToggleFavorite}
            style={styles.favButton}
          >
            <MaterialCommunityIcons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={18}
              color={isFavorite ? colors.primary : colors.text}
            />
          </Pressable>
        ) : null}

        {discount ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{discount}%</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.body, wide && styles.bodyWide]}>
        <Text style={styles.title} numberOfLines={2}>
          {listing.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {listing.brand} · {conditionById(listing.condition).label}
        </Text>

        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatPrice(listing.price)}</Text>
          {listing.originalPrice ? (
            <Text style={styles.original}>{formatPrice(listing.originalPrice)}</Text>
          ) : null}
        </View>

        <View style={styles.footerRow}>
          <MaterialCommunityIcons name="clock-outline" size={12} color={colors.textFaint} />
          <Text style={styles.footerText} numberOfLines={1}>
            {formatRelativeDate(listing.createdAt)}
          </Text>
          <MaterialCommunityIcons name="eye-outline" size={12} color={colors.textFaint} />
          <Text style={styles.footerText}>{listing.views}</Text>
        </View>

        <View style={styles.footerRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={12} color={colors.textFaint} />
          <Text style={styles.footerText} numberOfLines={1}>
            {listing.city}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardWide: { flexDirection: 'row' },
  pressed: { opacity: 0.9 },
  imageWrap: { aspectRatio: 1, backgroundColor: colors.surfaceAlt },
  imageWrapWide: { width: 118, aspectRatio: undefined },
  image: { width: '100%', height: '100%' },
  body: { padding: spacing.md, gap: 3 },
  bodyWide: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '700', color: colors.text, lineHeight: 18 },
  meta: { fontSize: 11.5, color: colors.textMuted },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  price: { fontSize: 16.5, fontWeight: '800', color: colors.primary },
  original: { fontSize: 12, color: colors.textFaint, textDecorationLine: 'line-through' },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  footerText: { fontSize: 11, color: colors.textFaint, marginRight: 4 },
  topBadges: { position: 'absolute', top: spacing.sm, left: spacing.sm, flexDirection: 'row' },
  badge: {
    backgroundColor: 'rgba(27,27,29,0.72)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    maxWidth: 130,
  },
  badgeReserved: { backgroundColor: colors.primary },
  badgeSold: { backgroundColor: colors.grey },
  badgeText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  favButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  discountText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
