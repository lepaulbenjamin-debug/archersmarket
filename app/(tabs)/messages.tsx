import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { Header, Screen } from '@/components/Screen';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';
import { useMessages } from '@/store/MessagesContext';
import { formatRelativeDate } from '@/utils/format';
import { imageSource } from '@/utils/images';

export default function MessagesScreen() {
  const router = useRouter();
  const { user, userById } = useAuth();
  const { listingById } = useListings();
  const { threads, loading } = useMessages();

  if (!user) {
    return (
      <Screen>
        <Header title="Messages" />
        <EmptyState
          icon="message-lock-outline"
          title="Connectez-vous pour discuter"
          description="Vos échanges avec les acheteurs et vendeurs apparaîtront ici."
          actionLabel="Se connecter"
          onAction={() => router.push('/login')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Messages" subtitle={`${threads.length} conversation${threads.length > 1 ? 's' : ''}`} />
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.conversation.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => {
            const other = userById(item.otherUserId);
            const listing = listingById(item.conversation.listingId);
            const preview = item.lastMessage?.offer
              ? `Offre : ${item.lastMessage.offer} € — ${item.lastMessage.text}`
              : item.lastMessage?.text ?? 'Nouvelle conversation';
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/chat/${item.conversation.id}`)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Avatar name={other?.name ?? '?'} color={other?.avatarColor} size={46} />
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={1}>
                      {other?.name ?? 'Membre'}
                    </Text>
                    <Text style={styles.time} numberOfLines={1}>
                      {formatRelativeDate(item.conversation.updatedAt)}
                    </Text>
                  </View>
                  <Text style={styles.listingTitle} numberOfLines={1}>
                    {listing?.title ?? 'Annonce supprimée'}
                  </Text>
                  <Text style={[styles.preview, item.unread && styles.previewUnread]} numberOfLines={1}>
                    {preview}
                  </Text>
                </View>
                {listing ? (
                  <Image
                    source={imageSource(listing.images[0], listing.category)}
                    style={styles.thumb}
                    contentFit="cover"
                  />
                ) : null}
                {item.unread ? <View style={styles.unreadDot} /> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="message-outline"
              title="Aucune conversation"
              description="Contactez un vendeur depuis une annonce pour démarrer un échange."
              actionLabel="Parcourir les annonces"
              onAction={() => router.push('/(tabs)')}
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing.xxl },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  time: { fontSize: 11.5, color: colors.textFaint, flexShrink: 0 },
  listingTitle: { fontSize: 12.5, color: colors.primaryDark, fontWeight: '600' },
  preview: { fontSize: 13, color: colors.textMuted },
  previewUnread: { color: colors.text, fontWeight: '700' },
  thumb: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  unreadDot: {
    position: 'absolute',
    top: 0,
    left: -6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  pressed: { opacity: 0.75 },
});
