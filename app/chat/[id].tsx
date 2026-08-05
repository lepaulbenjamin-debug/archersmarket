import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { Header, Screen } from '@/components/Screen';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';
import { useMessages } from '@/store/MessagesContext';
import { formatPrice, formatTime } from '@/utils/format';
import { imageSource } from '@/utils/images';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, userById } = useAuth();
  const { listingById } = useListings();
  const { threadById, sendMessage, markAsRead } = useMessages();
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);

  const thread = id ? threadById(id) : undefined;
  const other = thread ? userById(thread.otherUserId) : undefined;
  const listing = thread ? listingById(thread.conversation.listingId) : undefined;

  useEffect(() => {
    if (thread?.unread) markAsRead(thread.conversation.id);
  }, [markAsRead, thread]);

  if (!user || !thread) {
    return (
      <Screen>
        <Header title="Conversation" showBack />
        <EmptyState
          icon="message-off-outline"
          title="Conversation indisponible"
          description="Elle a peut-être été supprimée."
          actionLabel="Voir mes messages"
          onAction={() => router.replace('/(tabs)/messages')}
        />
      </Screen>
    );
  }

  const send = async () => {
    if (!text.trim()) return;
    const value = text;
    setText('');
    await sendMessage(thread.conversation.id, value);
    listRef.current?.scrollToEnd({ animated: true });
  };

  const submitOffer = async (amount: number) => {
    if (!listing || !amount || Number.isNaN(amount)) return;
    await sendMessage(
      thread.conversation.id,
      `Je te propose ${formatPrice(amount)} pour « ${listing.title} ».`,
      amount,
    );
    listRef.current?.scrollToEnd({ animated: true });
  };

  const makeOffer = () => {
    if (!listing) return;

    // Alert.prompt (saisie libre) n'existe que sur iOS ; ailleurs on propose -10 %.
    if (Platform.OS === 'ios' && Alert.prompt) {
      Alert.prompt(
        'Proposer un prix',
        `Prix demandé : ${formatPrice(listing.price)}`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Envoyer',
            onPress: (value?: string) => submitOffer(Number((value ?? '').replace(',', '.'))),
          },
        ],
        'plain-text',
        '',
        'numeric',
      );
      return;
    }

    const suggested = Math.round(listing.price * 0.9);
    Alert.alert('Proposer un prix', `Envoyer une offre à ${formatPrice(suggested)} (-10 %) ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Envoyer', onPress: () => submitOffer(suggested) },
    ]);
  };

  return (
    <Screen edges={['top']}>
      <Header title={other?.name ?? 'Conversation'} subtitle={other?.city} showBack />

      {listing ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/listing/${listing.id}`)}
          style={({ pressed }) => [styles.listingBar, pressed && styles.pressed]}
        >
          <Image
            source={imageSource(listing.images[0], listing.category)}
            style={styles.listingImage}
            contentFit="cover"
          />
          <View style={styles.listingText}>
            <Text style={styles.listingTitle} numberOfLines={1}>
              {listing.title}
            </Text>
            <Text style={styles.listingPrice}>{formatPrice(listing.price)}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textFaint} />
        </Pressable>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={listRef}
          data={thread.messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messages}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const mine = item.senderId === user.id;
            return (
              <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {item.offer ? (
                    <View style={[styles.offer, mine && styles.offerMine]}>
                      <MaterialCommunityIcons
                        name="tag-outline"
                        size={13}
                        color={mine ? colors.onPrimary : colors.primary}
                      />
                      <Text style={[styles.offerText, mine && styles.offerTextMine]}>
                        Offre : {formatPrice(item.offer)}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.text}</Text>
                  <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                    {formatTime(item.createdAt)}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="hand-wave-outline"
              title="Lancez la discussion"
              description="Posez vos questions sur l’état du matériel, l’envoi ou le prix."
            />
          }
        />

        <View style={styles.composer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Proposer un prix"
            onPress={makeOffer}
            style={({ pressed }) => [styles.offerButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="tag-outline" size={20} color={colors.primary} />
          </Pressable>
          <TextInput
            accessibilityLabel="Votre message"
            value={text}
            onChangeText={setText}
            placeholder="Votre message…"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            multiline
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Envoyer"
            onPress={send}
            disabled={!text.trim()}
            style={({ pressed }) => [
              styles.sendButton,
              !text.trim() && styles.sendDisabled,
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons name="send" size={19} color={colors.onPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listingImage: { width: 42, height: 42, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  listingText: { flex: 1 },
  listingTitle: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  listingPrice: { fontSize: 13, fontWeight: '700', color: colors.primary, marginTop: 1 },
  messages: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 3,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.sm,
  },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: radius.sm },
  bubbleText: { fontSize: 14.5, color: colors.text, lineHeight: 20 },
  bubbleTextMine: { color: colors.onPrimary },
  bubbleTime: { fontSize: 10.5, color: colors.textFaint, alignSelf: 'flex-end' },
  bubbleTimeMine: { color: 'rgba(248,247,243,0.65)' },
  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginBottom: 2,
  },
  offerMine: { backgroundColor: 'rgba(255,255,255,0.18)' },
  offerText: { fontSize: 11.5, fontWeight: '800', color: colors.primary },
  offerTextMine: { color: colors.onPrimary },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  offerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 42,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 14.5,
    color: colors.text,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sendDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
});
