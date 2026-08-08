import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { Avatar } from '@/components/Avatar';
import { BuyerPicker } from '@/components/BuyerPicker';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ListingCard } from '@/components/ListingCard';
import { Rating } from '@/components/Rating';
import { ReviewList } from '@/components/ReviewList';
import { Header, Screen } from '@/components/Screen';
import { fetchPendingReviews, fetchReviews } from '@/services/reviews';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';
import { usePush } from '@/store/PushContext';
import { formatMemberSince, formatPrice } from '@/utils/format';
import { imageSource } from '@/utils/images';
import type { ListingStatus, PendingReview, Review } from '@/types';

export default function ProfileScreen() {
  const router = useRouter();


  const { user, signOut } = useAuth();
  const { listingsBySeller, favoriteListings, setStatus, removeListing, isFavorite, toggleFavorite } =
    useListings();
  const [tab, setTab] = useState<'listings' | 'favorites' | 'reviews'>('listings');
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sellingListingId, setSellingListingId] = useState<string | null>(null);
  const { enabled: pushEnabled, unavailable: pushUnavailable, toggle: togglePush } = usePush();

  const myListings = useMemo(
    () => (user ? listingsBySeller(user.id) : []),
    [listingsBySeller, user],
  );

  // Rechargé à chaque retour sur l'onglet : un avis a pu être publié entre-temps.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      fetchPendingReviews(user.id).then(setPending).catch(() => setPending([]));
      fetchReviews(user.id).then(setReviews).catch(() => setReviews([]));
    }, [user]),
  );

  const stats = useMemo(() => {
    const sold = myListings.filter((l) => l.status === 'sold');
    return {
      active: myListings.filter((l) => l.status === 'active').length,
      sold: sold.length,
      earned: sold.reduce((sum, l) => sum + l.price, 0),
    };
  }, [myListings]);

  if (!user) {
    return (
      <Screen>
        <Header title="Mon compte" />
        <EmptyState
          icon="account-circle-outline"
          title="Rejoignez la communauté"
          description="Créez un compte pour publier des annonces, sauvegarder vos favoris et discuter avec les autres archers."
          actionLabel="Se connecter"
          onAction={() => router.push('/login')}
        />
        <View style={styles.registerLink}>
          <Text style={styles.registerText}>Pas encore de compte ?</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/register')} hitSlop={6}>
            <Text style={styles.registerAction}>Créer un compte</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const sellingListing = myListings.find((l) => l.id === sellingListingId);

  const cycleStatus = (id: string, current: ListingStatus) => {
    if (current === 'reserved') {
      // Conclure une vente passe par la désignation de l'acheteur.
      setSellingListingId(id);
      return;
    }
    setStatus(id, current === 'active' ? 'reserved' : 'active');
  };

  const confirmSale = async (buyerId: string | null) => {
    if (!sellingListingId) return;
    const id = sellingListingId;
    setSellingListingId(null);
    try {
      await setStatus(id, 'sold', buyerId);
      if (buyerId) {
        const refreshed = await fetchPendingReviews(user.id);
        setPending(refreshed);
      }
    } catch (error) {
      Alert.alert('Mise à jour impossible', (error as Error).message);
    }
  };

  const confirmDelete = (id: string, title: string) => {
    Alert.alert('Supprimer l’annonce', `« ${title} » sera définitivement retirée.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => removeListing(id) },
    ]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.identity}>
            <Avatar name={user.name} color={user.avatarColor} size={62} />
            <View style={styles.identityText}>
              <Text style={styles.name}>{user.name}</Text>
              <Text style={styles.handle}>@{user.handle}</Text>
              <Rating value={user.rating} count={user.reviewCount} />
            </View>
          </View>

          {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}

          <View style={styles.metaRow}>
            <Meta icon="map-marker-outline" label={user.city} />
            {user.club ? <Meta icon="account-group-outline" label={user.club} /> : null}
            <Meta icon="calendar-outline" label={`Membre depuis ${formatMemberSince(user.memberSince)}`} />
          </View>

          <View style={styles.stats}>
            <Stat value={stats.active.toString()} label="en ligne" />
            <Stat value={stats.sold.toString()} label="vendues" />
            <Stat value={formatPrice(stats.earned)} label="encaissés" />
          </View>
        </View>

        {pending.length > 0 ? (
          <View style={styles.pendingBlock}>
            <Text style={styles.pendingTitle}>
              {pending.length === 1 ? 'Une transaction à noter' : `${pending.length} transactions à noter`}
            </Text>
            {pending.map((item) => (
              <Pressable
                key={item.listingId}
                accessibilityRole="button"
                onPress={() => router.push(`/review/${item.listingId}`)}
                style={({ pressed }) => [styles.pendingRow, pressed && styles.pressed]}
              >
                <Image
                  source={imageSource(item.image, item.category)}
                  style={styles.pendingImage}
                  contentFit="cover"
                />
                <View style={styles.pendingText}>
                  <Text style={styles.pendingListing} numberOfLines={1}>
                    {item.listingTitle}
                  </Text>
                  <Text style={styles.pendingRole}>
                    Noter {item.role === 'seller' ? 'l’acheteur' : 'le vendeur'}
                  </Text>
                </View>
                <MaterialCommunityIcons name="star-outline" size={20} color={colors.primary} />
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.settings}>
          <View style={styles.settingRow}>
            <MaterialCommunityIcons name="bell-outline" size={19} color={colors.text} />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Notifications</Text>
              <Text style={styles.settingHint}>
                {pushUnavailable ?? 'Être prévenu des messages, offres et avis reçus.'}
              </Text>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={togglePush}
              trackColor={{ true: colors.primary, false: colors.borderStrong }}
              thumbColor={colors.surface}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/orders')}
            style={({ pressed }) => [styles.settingRow, styles.settingDivider, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="shield-check-outline" size={19} color={colors.text} />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Mes transactions</Text>
              <Text style={styles.settingHint}>
                Suivre vos achats et vos ventes réglés par paiement sécurisé.
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textFaint} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/account/payment')}
            style={({ pressed }) => [styles.settingRow, styles.settingDivider, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons
              name={user.acceptsPayments ? 'bank-check' : 'bank-outline'}
              size={19}
              color={user.acceptsPayments ? colors.success : colors.text}
            />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Recevoir des paiements</Text>
              <Text style={styles.settingHint}>
                {user.acceptsPayments
                  ? 'Vos acheteurs peuvent payer dans l’application. Vous touchez votre prix entier.'
                  : 'Vérifiez votre identité auprès de Stripe pour vendre en paiement sécurisé.'}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textFaint} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/account/blocked')}
            style={({ pressed }) => [styles.settingRow, styles.settingDivider, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="account-cancel-outline" size={19} color={colors.text} />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Membres bloqués</Text>
              <Text style={styles.settingHint}>
                Rétablir le contact avec quelqu’un que vous aviez bloqué.
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textFaint} />
          </Pressable>
        </View>

        <View style={styles.tabs}>
          <TabButton
            label={`Annonces (${myListings.length})`}
            active={tab === 'listings'}
            onPress={() => setTab('listings')}
          />
          <TabButton
            label={`Favoris (${favoriteListings.length})`}
            active={tab === 'favorites'}
            onPress={() => setTab('favorites')}
          />
          <TabButton
            label={`Avis (${reviews.length})`}
            active={tab === 'reviews'}
            onPress={() => setTab('reviews')}
          />
        </View>

        {tab === 'listings' ? (
          myListings.length === 0 ? (
            <EmptyState
              icon="tag-outline"
              title="Aucune annonce publiée"
              description="Vendez votre matériel inutilisé à d’autres archers."
              actionLabel="Publier une annonce"
              onAction={() => router.push('/(tabs)/sell')}
            />
          ) : (
            <View style={styles.list}>
              {myListings.map((listing) => (
                <View key={listing.id} style={styles.myListing}>
                  <ListingCard listing={listing} wide />
                  <View style={styles.actions}>
                    <Button
                      label={
                        listing.status === 'active'
                          ? 'Marquer réservée'
                          : listing.status === 'reserved'
                            ? 'Marquer vendue'
                            : 'Remettre en ligne'
                      }
                      variant="secondary"
                      size="sm"
                      onPress={() => cycleStatus(listing.id, listing.status)}
                      style={styles.actionButton}
                    />
                    <Button
                      label="Supprimer"
                      variant="danger"
                      size="sm"
                      onPress={() => confirmDelete(listing.id, listing.title)}
                    />
                  </View>
                </View>
              ))}
            </View>
          )
        ) : tab === 'favorites' ? (
          favoriteListings.length === 0 ? (
            <EmptyState
              icon="heart-outline"
              title="Aucun favori"
              description="Touchez le cœur d’une annonce pour la retrouver ici."
              actionLabel="Explorer"
              onAction={() => router.push('/(tabs)')}
            />
          ) : (
            <View style={styles.list}>
              {favoriteListings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  wide
                  isFavorite={isFavorite(listing.id)}
                  onToggleFavorite={() => toggleFavorite(listing.id)}
                />
              ))}
            </View>
          )
        ) : (
          <ReviewList
            reviews={reviews}
            emptyLabel="Personne ne vous a encore noté. Les avis arrivent après vos premières ventes conclues dans l’application."
          />
        )}

        <Button
          label="Se déconnecter"
          variant="ghost"
          icon="logout"
          onPress={signOut}
          style={styles.signOut}
        />

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/account/delete')}
          style={({ pressed }) => [styles.deleteRow, pressed && styles.pressed]}
        >
          <Text style={styles.deleteLabel}>Supprimer mon compte</Text>
        </Pressable>
      </ScrollView>

      <BuyerPicker
        visible={!!sellingListingId}
        listingId={sellingListingId}
        listingTitle={sellingListing?.title}
        onClose={() => setSellingListingId(null)}
        onConfirm={confirmSale}
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identityText: { flex: 1, gap: 2 },
  name: { fontSize: 19, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  handle: { fontSize: 13, color: colors.textFaint, marginBottom: 2 },
  bio: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaLabel: { fontSize: 12.5, color: colors.textMuted },
  stats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 16, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: 11.5, color: colors.textFaint, fontWeight: '600' },
  pendingBlock: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pendingTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.primaryDark,
    paddingHorizontal: spacing.xs,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  pendingImage: { width: 42, height: 42, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  pendingText: { flex: 1 },
  pendingListing: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  pendingRole: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  settings: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  settingText: { flex: 1 },
  settingLabel: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  settingHint: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  tabActive: { backgroundColor: colors.primary },
  tabLabel: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  tabLabelActive: { color: colors.onPrimary },
  list: { gap: spacing.md },
  myListing: { gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1, paddingHorizontal: spacing.md },
  settingDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  signOut: { marginTop: spacing.sm },
  deleteRow: { alignItems: 'center', paddingVertical: spacing.sm },
  deleteLabel: { fontSize: 13, fontWeight: '600', color: colors.danger },
  registerLink: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  registerText: { color: colors.textMuted, fontSize: 14 },
  registerAction: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.85 },
});
