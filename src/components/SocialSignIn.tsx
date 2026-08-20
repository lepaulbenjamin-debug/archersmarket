import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { appleSignInAvailable, signInWithApple, signInWithGoogle } from '@/services/oauth';
import { colors, radius, spacing } from '@/theme';

/**
 * Connexion par Apple et par Google.
 *
 * Le bouton Apple est celui fourni par le système : Apple impose son dessin,
 * son libellé et ses proportions, et refuse les imitations à la revue.
 */
export function SocialSignIn({
  onDone,
  onError,
}: {
  onDone: (fullName?: string) => void;
  onError: (message: string) => void;
}) {
  const [apple, setApple] = useState(false);
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);

  useEffect(() => {
    appleSignInAvailable().then(setApple);
  }, []);

  const run = async (quoi: 'apple' | 'google') => {
    setBusy(quoi);
    try {
      const result = quoi === 'apple' ? await signInWithApple() : await signInWithGoogle();
      // Une fermeture volontaire n'est pas un incident : on ne dit rien.
      if (!result.cancelled) onDone(result.fullName);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.bloc}>
      <View style={styles.separateur}>
        <View style={styles.trait} />
        <Text style={styles.ou}>ou</Text>
        <View style={styles.trait} />
      </View>

      {apple ? (
        busy === 'apple' ? (
          <View style={styles.attente}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={999}
            style={styles.apple}
            onPress={() => run('apple')}
          />
        )
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continuer avec Google"
        onPress={() => run('google')}
        disabled={busy !== null}
        style={({ pressed }) => [styles.google, pressed && styles.pressed, busy && styles.eteint]}
      >
        {busy === 'google' ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <>
            <MaterialCommunityIcons name="google" size={18} color={colors.text} />
            <Text style={styles.googleTexte}>Continuer avec Google</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { gap: spacing.md },
  separateur: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  trait: { flex: 1, height: 1, backgroundColor: colors.border },
  ou: { fontSize: 12.5, color: colors.textFaint },
  apple: { height: 48 },
  attente: { height: 48, alignItems: 'center', justifyContent: 'center' },
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  googleTexte: { fontSize: 15, fontWeight: '700', color: colors.text },
  pressed: { opacity: 0.85 },
  eteint: { opacity: 0.6 },
});
