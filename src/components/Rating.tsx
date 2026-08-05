import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

interface Props {
  value: number;
  count?: number;
  size?: number;
  compact?: boolean;
}

export function Rating({ value, count, size = 14, compact }: Props) {
  if (!count) {
    return <Text style={[styles.empty, { fontSize: size - 1 }]}>Nouveau membre</Text>;
  }
  return (
    <View style={styles.row}>
      {!compact &&
        [1, 2, 3, 4, 5].map((star) => (
          <MaterialCommunityIcons
            key={star}
            name={value >= star - 0.25 ? 'star' : value >= star - 0.75 ? 'star-half-full' : 'star-outline'}
            size={size}
            color={colors.primary}
          />
        ))}
      {compact ? <MaterialCommunityIcons name="star" size={size} color={colors.primary} /> : null}
      <Text style={[styles.value, { fontSize: size - 0.5 }]}>
        {value.toFixed(1)}
        <Text style={styles.count}> ({count})</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  value: { fontWeight: '700', color: colors.text, marginLeft: 3 },
  count: { fontWeight: '500', color: colors.textFaint },
  empty: { color: colors.textFaint, fontWeight: '600' },
});
