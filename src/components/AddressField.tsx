import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Field } from '@/components/Field';
import { suggestAddresses, type AddressSuggestion } from '@/services/address';
import { colors, radius, spacing } from '@/theme';

/**
 * Champ d'adresse à suggestions.
 *
 * Choisir dans la liste remplit d'un coup la voie, le code postal et la
 * ville. C'est ce qui compte : un code postal tapé de travers fait coter le
 * mauvais trajet, et l'étiquette échoue après le paiement — trop tard.
 *
 * La frappe est temporisée et la requête précédente annulée : sans cela on
 * interroge le service public à chaque lettre, et les réponses reviennent
 * dans le désordre.
 */
export function AddressField({
  value,
  onChangeText,
  onSelect,
  label = 'Adresse',
  municipality = false,
  ...rest
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  label?: string;
  /** Ne proposer que des communes, sans voie ni numéro. */
  municipality?: boolean;
} & Omit<React.ComponentProps<typeof Field>, 'label' | 'value' | 'onChangeText'>) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  const enCours = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!touched || value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const minuteur = setTimeout(async () => {
      enCours.current?.abort();
      const controleur = new AbortController();
      enCours.current = controleur;
      setLoading(true);
      try {
        setSuggestions(
          await suggestAddresses(value, controleur.signal, municipality ? 'municipality' : undefined),
        );
      } catch {
        // Réseau absent ou requête annulée : on se tait, la saisie manuelle
        // reste possible et c'est elle qui fait foi.
      } finally {
        if (!controleur.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => clearTimeout(minuteur);
  }, [value, touched, municipality]);

  const choisir = (suggestion: AddressSuggestion) => {
    setSuggestions([]);
    setTouched(false);
    onSelect(suggestion);
  };

  return (
    <View style={styles.container}>
      <Field
        label={label}
        value={value}
        onChangeText={(texte) => {
          setTouched(true);
          onChangeText(texte);
        }}
        autoComplete="street-address"
        autoCorrect={false}
        {...rest}
      />
      {loading ? <ActivityIndicator style={styles.loader} size="small" color={colors.primary} /> : null}

      {suggestions.length > 0 ? (
        <View style={styles.liste}>
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion.label}
              accessibilityRole="button"
              onPress={() => choisir(suggestion)}
              style={({ pressed }) => [styles.ligne, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="map-marker-outline" size={16} color={colors.primary} />
              <Text style={styles.texte} numberOfLines={2}>
                {suggestion.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  loader: { position: 'absolute', right: 14, top: 38 },
  liste: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { backgroundColor: colors.surfaceAlt },
  texte: { flex: 1, fontSize: 13.5, color: colors.text },
});
