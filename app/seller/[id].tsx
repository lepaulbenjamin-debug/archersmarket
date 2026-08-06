import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { ListingGrid } from '@/components/ListingGrid';
import { Rating } from '@/components/Rating';
import { ReportSheet } from '@/components/ReportSheet';
import { ReviewList } from '@/components/ReviewList';
import { Header, Screen } from '@/components/Screen';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';
import { fetchReviews } from '@/services/reviews';
import { formatMemberSince } from '@/utils/format';
import type { Review } from '@/types';

export default function SellerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userById, user: currentUser } = useAuth();
  const { listingsBySeller, isFavorite, toggleFavorite } = useListings();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchReviews(id).then(setReviews).catch(() => setReviews([]));
  }, [id]);

  const seller = id ? userById(id) : undefined;
  const listings = useMemo(
    () => (id ? listingsBySeller(id).filter((l) => l.status !== 'sold') : []),
    [id, listingsBySeller],
  );

  if (!seller) {
    return (
      <Screen>
        <Header title="Vendeur" showBack />
        <EmptyState
          icon="account-question-outline"
          title="Profil introuvable"
          actionLabel="Retour"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title={seller.name}
        showBack
        right={
          currentUser && currentUser.id !== seller.id ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Signaler ce membre"
              hitSlop={8}
              onPress={() => setReporting(true)}
              style={styles.reportButton}
            >
              <MaterialCommunityIcons name="flag-outline" size={18} color={colors.textMuted} />
            </Pressable>
          ) : undefined
        }
      />
      <ListingGrid
        listings={listings}
        isFavorite={isFavorite}
        onToggleFavorite={currentUser ? toggleFavorite : undefined}
        header={
          <View style={styles.card}>
            <View style={styles.identity}>
              <Avatar name={seller.name} color={seller.avatarColor} size={58} />
              <View style={styles.identityText}>
                <Text style={styles.name}>{seller.name}</Text>
                <Text style={styles.handle}>@{seller.handle}</Text>
                <Rating value={seller.rating} count={seller.reviewCount} />
              </View>
            </View>
            {seller.bio ? <Text style={styles.bio}>{seller.bio}</Text> : null}
            <View style={styles.metaRow}>
              <Meta icon="map-marker-outline" label={seller.city} />
              {seller.club ? <Meta icon="account-group-outline" label={seller.club} /> : null}
              {seller.discipline ? <Meta icon="bow-arrow" label={seller.discipline} /> : null}
              <Meta
                icon="calendar-outline"
                label={`Membre depuis ${formatMemberSince(seller.memberSince)}`}
              />
            </View>
            <View style={styles.reviews}>
              <Text style={styles.sectionTitle}>
                {reviews.length === 0
                  ? 'Avis'
                  : `${reviews.length} avis reçu${reviews.length > 1 ? 's' : ''}`}
              </Text>
              <ReviewList
                reviews={reviews.slice(0, 5)}
                emptyLabel="Ce membre n’a pas encore reçu d’avis."
              />
            </View>

            <Text style={styles.sectionTitle}>
              {listings.length} annonce{listings.length > 1 ? 's' : ''} en ligne
            </Text>
          </View>
        }
        empty={<EmptyState icon="tag-off-outline" title="Aucune annonce en ligne pour l’instant" />}
      />

      <ReportSheet
        visible={reporting}
        onClose={() => setReporting(false)}
        profileId={seller.id}
        subject={seller.name}
      />
    </Screen>
  );
}

function Meta({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
}) {
  return (
    <View style={styles.meta}>
      <MaterialCommunityIcons name={icon} size={13} color={colors.textMuted} />
      <Text style={styles.metaLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identityText: { flex: 1, gap: 2 },
  name: { fontSize: 18, fontWeight: '800', color: colors.text },
  handle: { fontSize: 13, color: colors.textFaint, marginBottom: 2 },
  bio: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaLabel: { fontSize: 12.5, color: colors.textMuted },
  reportButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  reviews: { gap: spacing.sm },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
});
