import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ListingCard } from '@/components/ListingCard';
import { Rating } from '@/components/Rating';
import { ReportSheet } from '@/components/ReportSheet';
import { Screen } from '@/components/Screen';
import { categoryById, conditionById, handednessLabel } from '@/data/catalog';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';
import { useMessages } from '@/store/MessagesContext';
import { discountPercent, formatPrice, formatRelativeDate } from '@/utils/format';
import { imageSource } from '@/utils/images';

const { width } = Dimensions.get('window');

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, userById } = useAuth();
  const { listingById, listings, isFavorite, toggleFavorite, registerView } = useListings();
  const { openConversation } = useMessages();
  const [imageIndex, setImageIndex] = useState(0);
  const [reporting, setReporting] = useState(false);
  const viewed = useRef(false);

  const listing = id ? listingById(id) : undefined;
  const seller = listing ? userById(listing.sellerId) : undefined;

  useEffect(() => {
    if (listing && !viewed.current) {
      viewed.current = true;
      registerView(listing.id);
    }
  }, [listing, registerView]);

  const similar = useMemo(
    () =>
      listing
        ? listings
            .filter(
              (l) => l.id !== listing.id && l.category === listing.category && l.status !== 'sold',
            )
            .slice(0, 4)
        : [],
    [listing, listings],
  );

  if (!listing) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title="Annonce introuvable"
          description="Elle a peut-être été retirée par son vendeur."
          actionLabel="Retour à l’accueil"
          onAction={() => router.replace('/')}
        />
      </Screen>
    );
  }

  const category = categoryById(listing.category);
  const condition = conditionById(listing.condition);
  const discount = discountPercent(listing.price, listing.originalPrice);
  const isOwner = user?.id === listing.sellerId;
  const images = listing.images.length ? listing.images : [listing.category];

  const specs: Array<[string, string]> = [
    ['Catégorie', category.label],
    ['Marque', listing.brand],
    ['État', condition.label],
    ['Main d’arc', handednessLabel(listing.handedness)],
  ];
  if (listing.drawWeight) specs.push(['Puissance', `${listing.drawWeight} lbs`]);
  if (listing.bowLength) specs.push(['Longueur', `${listing.bowLength}"`]);
  if (listing.drawLength) specs.push(['Allonge', `${listing.drawLength}"`]);
  if (listing.spine) specs.push(['Spine', `${listing.spine}`]);
  if (listing.size) specs.push(['Taille', listing.size]);
  specs.push([
    'Livraison',
    listing.shipping
      ? listing.shippingPrice
        ? `Envoi ${formatPrice(listing.shippingPrice)}`
        : 'Envoi possible, frais à convenir'
      : 'Remise en main propre',
  ]);

  const contactSeller = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    const conversationId = await openConversation(listing.id, listing.sellerId);
    router.push(`/chat/${conversationId}`);
  };

  const handleFavorite = () => {
    if (!user) {
      router.push('/login');
      return;
    }
    toggleFavorite(listing.id);
  };

  const shareListing = () =>
    Share.share({
      message: `${listing.title} — ${formatPrice(listing.price)} sur Archers Market`,
    }).catch(() => undefined);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) =>
              setImageIndex(Math.round(event.nativeEvent.contentOffset.x / width))
            }
          >
            {images.map((image, index) => (
              <Image
                key={`${image}-${index}`}
                source={imageSource(image, listing.category)}
                style={styles.hero}
                contentFit="cover"
                transition={180}
              />
            ))}
          </ScrollView>

          <SafeAreaView edges={['top']} style={styles.heroOverlay} pointerEvents="box-none">
            <View style={styles.heroActions} pointerEvents="box-none">
              <RoundButton
                icon="chevron-left"
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
                label="Retour"
              />
              <View style={styles.heroRight}>
                <RoundButton icon="share-variant-outline" onPress={shareListing} label="Partager" />
                <RoundButton
                  icon={isFavorite(listing.id) ? 'heart' : 'heart-outline'}
                  color={isFavorite(listing.id) ? colors.primary : colors.text}
                  onPress={handleFavorite}
                  label="Favori"
                />
              </View>
            </View>
          </SafeAreaView>

          {images.length > 1 ? (
            <View style={styles.dots}>
              {images.map((image, index) => (
                <View
                  key={`dot-${image}-${index}`}
                  style={[styles.dot, index === imageIndex && styles.dotActive]}
                />
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <View style={styles.badges}>
            <View style={styles.badge}>
              <MaterialCommunityIcons name={category.icon} size={13} color={colors.primary} />
              <Text style={styles.badgeText}>{category.short}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{condition.label}</Text>
            </View>
            {listing.status !== 'active' ? (
              <View style={[styles.badge, styles.badgeAlert]}>
                <Text style={[styles.badgeText, styles.badgeAlertText]}>
                  {listing.status === 'sold' ? 'Vendu' : 'Réservé'}
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.title}>{listing.title}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(listing.price)}</Text>
            {listing.originalPrice ? (
              <Text style={styles.original}>{formatPrice(listing.originalPrice)}</Text>
            ) : null}
            {discount ? (
              <View style={styles.discount}>
                <Text style={styles.discountText}>-{discount}%</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.metaRow}>
            <MetaItem icon="map-marker-outline" label={listing.city} />
            <MetaItem icon="clock-outline" label={formatRelativeDate(listing.createdAt)} />
            <MetaItem icon="eye-outline" label={`${listing.views} vues`} />
          </View>

          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{listing.description}</Text>

          <Text style={styles.sectionTitle}>Caractéristiques</Text>
          <View style={styles.specs}>
            {specs.map(([label, value]) => (
              <View key={label} style={styles.specRow}>
                <Text style={styles.specLabel}>{label}</Text>
                <Text style={styles.specValue}>{value}</Text>
              </View>
            ))}
          </View>

          {seller ? (
            <>
              <Text style={styles.sectionTitle}>Vendeur</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/seller/${seller.id}`)}
                style={({ pressed }) => [styles.sellerCard, pressed && styles.pressed]}
              >
                <Avatar name={seller.name} color={seller.avatarColor} size={48} />
                <View style={styles.sellerText}>
                  <Text style={styles.sellerName}>{seller.name}</Text>
                  <Rating value={seller.rating} count={seller.reviewCount} size={13} />
                  {seller.club ? <Text style={styles.sellerClub}>{seller.club}</Text> : null}
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textFaint} />
              </Pressable>
            </>
          ) : null}

          {!isOwner ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setReporting(true)}
              style={({ pressed }) => [styles.report, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="flag-outline" size={15} color={colors.textMuted} />
              <Text style={styles.reportLabel}>Signaler cette annonce</Text>
            </Pressable>
          ) : null}

          {similar.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Annonces similaires</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.similarRow}
              >
                {similar.map((item) => (
                  <View key={item.id} style={styles.similarCard}>
                    <ListingCard listing={item} />
                  </View>
                ))}
              </ScrollView>
            </>
          ) : null}
        </View>
      </ScrollView>

      <ReportSheet
        visible={reporting}
        onClose={() => setReporting(false)}
        listingId={listing.id}
        subject={listing.title}
      />

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <View style={styles.footerInner}>
          <View style={styles.footerPrice}>
            <Text style={styles.footerLabel}>Prix</Text>
            <Text style={styles.footerValue}>{formatPrice(listing.price)}</Text>
          </View>
          {isOwner ? (
            <Button
              label="Gérer mon annonce"
              icon="cog-outline"
              onPress={() => router.push('/(tabs)/profile')}
              style={styles.footerButton}
            />
          ) : (
            <Button
              label={listing.status === 'sold' ? 'Article vendu' : 'Contacter le vendeur'}
              icon="message-text-outline"
              disabled={listing.status === 'sold'}
              onPress={contactSeller}
              style={styles.footerButton}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function RoundButton({
  icon,
  onPress,
  color = colors.text,
  label,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
  color?: string;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name={icon} size={20} color={color} />
    </Pressable>
  );
}

function MetaItem({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
}) {
  return (
    <View style={styles.metaItem}>
      <MaterialCommunityIcons name={icon} size={14} color={colors.textMuted} />
      <Text style={styles.metaLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 120 },
  hero: { width, height: width * 0.92, backgroundColor: colors.surfaceAlt },
  heroOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  heroActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  heroRight: { flexDirection: 'row', gap: spacing.sm },
  roundButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    position: 'absolute',
    bottom: spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotActive: { backgroundColor: colors.surface, width: 16 },
  body: {
    backgroundColor: colors.background,
    marginTop: -spacing.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  badges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  badgeAlert: { backgroundColor: colors.primarySoft },
  badgeAlertText: { color: colors.warning },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, lineHeight: 28, letterSpacing: -0.4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  price: { fontSize: 26, fontWeight: '800', color: colors.primary },
  original: { fontSize: 15, color: colors.textFaint, textDecorationLine: 'line-through' },
  discount: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  discountText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaLabel: { fontSize: 13, color: colors.textMuted },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.md },
  description: { fontSize: 14.5, color: colors.textMuted, lineHeight: 22 },
  specs: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.lg,
  },
  specLabel: { fontSize: 13.5, color: colors.textMuted },
  specValue: { fontSize: 13.5, fontWeight: '700', color: colors.text, flexShrink: 1, textAlign: 'right' },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  sellerText: { flex: 1, gap: 2 },
  sellerName: { fontSize: 15.5, fontWeight: '700', color: colors.text },
  sellerClub: { fontSize: 12.5, color: colors.textFaint },
  report: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  reportLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  similarRow: { gap: spacing.md, paddingVertical: 2 },
  similarCard: { width: 168 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  footerPrice: { gap: 1 },
  footerLabel: { fontSize: 11.5, color: colors.textFaint, fontWeight: '600' },
  footerValue: { fontSize: 19, fontWeight: '800', color: colors.primary },
  footerButton: { flex: 1 },
  pressed: { opacity: 0.85 },
});
