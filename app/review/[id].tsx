import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Header, Screen } from '@/components/Screen';
import { createReview } from '@/services/reviews';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';

const HINTS: Record<number, string> = {
  1: 'Très décevant',
  2: 'Décevant',
  3: 'Correct',
  4: 'Bonne expérience',
  5: 'Parfait',
};

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, userById } = useAuth();
  const { listingById, refresh } = useListings();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const listing = id ? listingById(id) : undefined;
  const counterpartId =
    listing && user ? (listing.sellerId === user.id ? listing.buyerId : listing.sellerId) : undefined;
  const counterpart = counterpartId ? userById(counterpartId) : undefined;
  const asSeller = !!listing && !!user && listing.sellerId === user.id;

  if (!user || !listing || !counterpartId) {
    return (
      <Screen>
        <Header title="Laisser un avis" showBack />
        <EmptyState
          icon="star-off-outline"
          title="Transaction introuvable"
          description="Cette vente n’est plus disponible, ou aucun acheteur n’a été désigné."
          actionLabel="Retour"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const submit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await createReview({
        listingId: listing.id,
        authorId: user.id,
        subjectId: counterpartId,
        rating,
        comment,
      });
      await refresh();
      router.back();
    } catch (error) {
      Alert.alert('Avis non publié', (error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <Header title="Laisser un avis" showBack />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Avatar name={counterpart?.name ?? '?'} color={counterpart?.avatarColor} size={52} />
            <View style={styles.cardText}>
              <Text style={styles.name}>{counterpart?.name ?? 'Membre'}</Text>
              <Text style={styles.role}>
                {asSeller ? 'Acheteur' : 'Vendeur'} · {listing.title}
              </Text>
            </View>
          </View>

          <Text style={styles.question}>
            {asSeller
              ? 'Comment s’est passée la transaction avec cet acheteur ?'
              : 'Comment s’est passé cet achat ?'}
          </Text>

          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={`${value} étoile${value > 1 ? 's' : ''}`}
                onPress={() => setRating(value)}
                hitSlop={6}
              >
                <MaterialCommunityIcons
                  name={rating >= value ? 'star' : 'star-outline'}
                  size={40}
                  color={rating >= value ? colors.primary : colors.borderStrong}
                />
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>{rating ? HINTS[rating] : 'Touchez une étoile pour noter'}</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Commentaire (optionnel)</Text>
            <TextInput
              accessibilityLabel="Commentaire"
              value={comment}
              onChangeText={setComment}
              placeholder={
                asSeller
                  ? 'Paiement, ponctualité, échanges…'
                  : 'Conformité à l’annonce, emballage, délai d’envoi…'
              }
              placeholderTextColor={colors.textFaint}
              multiline
              numberOfLines={5}
              maxLength={1000}
              style={styles.textarea}
            />
            <Text style={styles.counter}>{comment.length}/1000</Text>
          </View>

          <Button
            label="Publier mon avis"
            icon="star-outline"
            onPress={submit}
            loading={submitting}
            disabled={rating === 0}
          />
          <Text style={styles.notice}>
            Votre avis est public et visible sur le profil de ce membre. Vous ne pouvez en laisser
            qu’un seul par transaction.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardText: { flex: 1 },
  name: { fontSize: 16.5, fontWeight: '800', color: colors.text },
  role: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  question: { fontSize: 15.5, fontWeight: '700', color: colors.text, textAlign: 'center' },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  hint: {
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: -spacing.sm,
  },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: colors.text },
  textarea: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
  },
  counter: { fontSize: 11.5, color: colors.textFaint, alignSelf: 'flex-end' },
  notice: { fontSize: 12, color: colors.textFaint, lineHeight: 18, textAlign: 'center' },
});
