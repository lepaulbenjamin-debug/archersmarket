import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { ListingGrid } from '@/components/ListingGrid';
import { Rating } from '@/components/Rating';
import { Header, Screen } from '@/components/Screen';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';
import { formatMemberSince } from '@/utils/format';

export default function SellerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userById, user: currentUser } = useAuth();
  const { listingsBySeller, isFavorite, toggleFavorite } = useListings();

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
      <Header title={seller.name} showBack />
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
            <Text style={styles.sectionTitle}>
              {listings.length} annonce{listings.length > 1 ? 's' : ''} en ligne
            </Text>
          </View>
        }
        empty={<EmptyState icon="tag-off-outline" title="Aucune annonce en ligne pour l’instant" />}
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
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
});
