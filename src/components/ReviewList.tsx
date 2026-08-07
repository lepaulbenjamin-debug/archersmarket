import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { colors, radius, spacing } from '@/theme';
import type { Review } from '@/types';
import { formatRelativeDate } from '@/utils/format';
import { useAuth } from '@/store/AuthContext';

interface Props {
  reviews: Review[];
  /** Affiché tant qu'aucun avis n'a été reçu. */
  emptyLabel?: string;
}

export function ReviewList({ reviews, emptyLabel = 'Aucun avis pour l’instant.' }: Props) {
  const { userById } = useAuth();

  if (reviews.length === 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  return (
    <View style={styles.list}>
      {reviews.map((review) => {
        const author = userById(review.authorId);
        return (
          <View key={review.id} style={styles.card}>
            <Avatar name={author?.name ?? '?'} color={author?.avatarColor} size={36} />
            <View style={styles.body}>
              <View style={styles.head}>
                <Text style={styles.name} numberOfLines={1}>
                  {author?.name ?? 'Membre'}
                </Text>
                <Text style={styles.date}>{formatRelativeDate(review.createdAt)}</Text>
              </View>
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <MaterialCommunityIcons
                    key={value}
                    name={review.rating >= value ? 'star' : 'star-outline'}
                    size={13}
                    color={colors.primary}
                  />
                ))}
              </View>
              {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  empty: { fontSize: 13.5, color: colors.textFaint, lineHeight: 20 },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  body: { flex: 1, gap: 3 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
  date: { fontSize: 11.5, color: colors.textFaint, flexShrink: 0 },
  stars: { flexDirection: 'row', gap: 1 },
  comment: { fontSize: 13.5, color: colors.textMuted, lineHeight: 19, marginTop: 2 },
});
