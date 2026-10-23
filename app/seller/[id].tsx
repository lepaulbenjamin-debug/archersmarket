import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ListingGrid } from '@/components/ListingGrid';
import { Rating } from '@/components/Rating';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { MemberMenu } from '@/components/MemberMenu';
import { ReviewList } from '@/components/ReviewList';
import { Header, Screen } from '@/components/Screen';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';
import { fetchFollowState, follow, unfollow, type FollowState } from '@/services/follows';
import { fetchReviews } from '@/services/reviews';
import { usePush } from '@/store/PushContext';
import { partagerVendeur } from '@/utils/partage';
import { formatMemberSince } from '@/utils/format';
import type { Review } from '@/types';

export default function SellerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userById, user: currentUser } = useAuth();
  const { listingsBySeller, isFavorite, toggleFavorite } = useListings();

  const [reviews, setReviews] = useState<Review[]>([]);
  const { enabled: notificationsActives } = usePush();
  // `null` : abonnements indisponibles — le bouton ne s'affiche pas.
  const [abonnement, setAbonnement] = useState<FollowState | null>(null);
  const [basculeEnCours, setBasculeEnCours] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchReviews(id).then(setReviews).catch(() => setReviews([]));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let vivant = true;
    fetchFollowState(id, currentUser?.id)
      .then((etat) => vivant && setAbonnement(etat))
      .catch(() => vivant && setAbonnement(null));
    return () => {
      vivant = false;
    };
  }, [id, currentUser?.id]);

  const basculerAbonnement = async () => {
    if (!id || !abonnement) return;
    if (!currentUser) {
      router.push('/login');
      return;
    }
    const suivre = !abonnement.following;
    setBasculeEnCours(true);
    try {
      await (suivre ? follow(currentUser.id, id) : unfollow(currentUser.id, id));
      setAbonnement({
        following: suivre,
        followers: Math.max(0, abonnement.followers + (suivre ? 1 : -1)),
      });
      // Suivre sans notifications, c'est croire qu'on sera prévenu alors que
      // rien n'arrivera. On le dit tout de suite, une fois.
      if (suivre && !notificationsActives) {
        Alert.alert(
          `Vous suivez ${seller?.name ?? 'ce vendeur'}`,
          Platform.OS === 'web'
            ? 'Ses nouvelles annonces sont signalées par notification, sur l’application : installez-la sur votre téléphone pour être prévenu.'
            : 'Pour être prévenu de ses nouvelles annonces, activez les notifications dans Compte → Mes alertes.',
        );
      }
    } catch (erreur) {
      Alert.alert('Abonnement impossible', (erreur as Error).message);
    } finally {
      setBasculeEnCours(false);
    }
  };

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
    <Screen wide>
      <Header
        title={seller.name}
        showBack
        right={<MemberMenu memberId={seller.id} memberName={seller.name} />}
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
              {seller.acceptsPayments ? <VerifiedBadge /> : null}
              </View>
            </View>
            <View style={styles.actions}>
              {abonnement && currentUser?.id !== seller.id ? (
                <Button
                  label={abonnement.following ? 'Abonné' : 'Suivre'}
                  icon={abonnement.following ? 'check' : 'plus'}
                  variant={abonnement.following ? 'secondary' : 'primary'}
                  size="sm"
                  loading={basculeEnCours}
                  onPress={basculerAbonnement}
                />
              ) : null}
              <Button
                label={currentUser?.id === seller.id ? 'Partager mes annonces' : 'Partager ses annonces'}
                icon="share-variant-outline"
                variant="secondary"
                size="sm"
                onPress={() => partagerVendeur(seller, listings.length)}
              />
              {abonnement ? (
                <Text style={styles.abonnes}>
                  {abonnement.followers} abonné{abonnement.followers > 1 ? 's' : ''}
                </Text>
              ) : null}
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  abonnes: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaLabel: { fontSize: 12.5, color: colors.textMuted },
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
