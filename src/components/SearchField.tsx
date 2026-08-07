import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

interface Props {
  value?: string;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  /** Rend le champ non éditable et déclenche onPress (usage : barre d'accueil). */
  readOnly?: boolean;
  onPress?: () => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
}

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Rechercher un arc, une marque…',
  readOnly,
  onPress,
  onSubmit,
  autoFocus,
}: Props) {
  if (readOnly) {
    return (
      <Pressable
        accessibilityRole="search"
        onPress={onPress}
        style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="magnify" size={20} color={colors.textMuted} />
        <Text style={styles.placeholder}>{placeholder}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name="magnify" size={20} color={colors.textMuted} />
      <TextInput
        accessibilityLabel="Rechercher"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        autoCorrect={false}
      />
      {value ? (
        <Pressable accessibilityLabel="Effacer" hitSlop={8} onPress={() => onChangeText?.('')}>
          <MaterialCommunityIcons name="close-circle" size={18} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    height: 46,
  },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  placeholder: { flex: 1, fontSize: 15, color: colors.textFaint },
  pressed: { opacity: 0.8 },
});
