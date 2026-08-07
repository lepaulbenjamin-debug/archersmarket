import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';
import { initials } from '@/utils/format';

interface Props {
  name: string;
  color?: string;
  size?: number;
}

export function Avatar({ name, color = colors.primary, size = 44 }: Props) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.onPrimary, fontWeight: '700' },
});
