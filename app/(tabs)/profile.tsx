import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ListingCard } from '@/components/ListingCard';
import { Rating } from '@/components/Rating';
import { Header, Screen } from '@/components/Screen';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';
import { formatMemberSince, formatPrice } from '@/utils/format';
import type { ListingStatus } from '@/types';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { listingsBySeller, favoriteListings, setStatus, removeListing, isFavorite, toggleFavorite } =
    useListings();
  const [tab, setTab] = useState<'listings' | 'favorites'>('listings');

  const myListings = useMemo(
    () => (user ? listingsBySeller(user.id) : []),
    [listingsBySeller, user],
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

  const cycleStatus = (id: string, current: ListingStatus) => {
    const next: ListingStatus =
      current === 'active' ? 'reserved' : current === 'reserved' ? 'sold' : 'active';
    setStatus(id, next);
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

        <View style={styles.tabs}>
          <TabButton
            label={`Mes annonces (${myListings.length})`}
            active={tab === 'listings'}
            onPress={() => setTab('listings')}
          />
          <TabButton
            label={`Favoris (${favoriteListings.length})`}
            active={tab === 'favorites'}
            onPress={() => setTab('favorites')}
          />
        </View>

        {tab === 'listings' ? (
          myListings.length === 0 ? (
            <EmptyState
              icon="tag-outline"
              title="Aucune annonce publiée"
              description="Vendez votre matériel inutilisé à d’autres archers."
              actionLabel="Déposer une annonce"
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
        ) : favoriteListings.length === 0 ? (
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
        )}

        <Button
          label="Se déconnecter"
          variant="ghost"
          icon="logout"
          onPress={signOut}
          style={styles.signOut}
        />
      </ScrollView>
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
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
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
  tabs: { flexDirection: 'row', gap: spacing.sm },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  tabActive: { backgroundColor: colors.primary },
  tabLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  tabLabelActive: { color: colors.onPrimary },
  list: { gap: spacing.md },
  myListing: { gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
  signOut: { marginTop: spacing.sm },
  registerLink: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  registerText: { color: colors.textMuted, fontSize: 14 },
  registerAction: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});
