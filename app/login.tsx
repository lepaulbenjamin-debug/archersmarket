import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Logo } from '@/components/Logo';
import { Header, Screen } from '@/components/Screen';
import { demoAccount } from '@/data/seed';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (credentials = { email, password }) => {
    setError(null);
    setLoading(true);
    try {
      await signIn(credentials);
      router.canGoBack() ? router.back() : router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Header title="Connexion" showBack />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <Logo size={54} layout="stacked" tagline wordSize={19} />
            <Text style={styles.introTitle}>Bon retour parmi nous</Text>
            <Text style={styles.introText}>
              Retrouvez vos annonces, vos favoris et vos conversations.
            </Text>
          </View>

          <Field
            label="Adresse e-mail"
            placeholder="vous@exemple.fr"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field
            label="Mot de passe"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            error={error ?? undefined}
          />

          <Button label="Se connecter" onPress={() => submit()} loading={loading} />

          <Pressable
            accessibilityRole="button"
            onPress={() => submit(demoAccount)}
            style={({ pressed }) => [styles.demo, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="flash-outline" size={17} color={colors.primary} />
            <View style={styles.flex}>
              <Text style={styles.demoTitle}>Essayer avec le compte de démo</Text>
              <Text style={styles.demoText}>{demoAccount.email} · demo1234</Text>
            </View>
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Pas encore de compte ?</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/register')}
              hitSlop={6}
            >
              <Text style={styles.footerAction}>Créer un compte</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  intro: { gap: spacing.xs, marginBottom: spacing.sm, alignItems: 'center' },
  introTitle: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: spacing.lg },
  introText: { fontSize: 14, color: colors.textMuted, lineHeight: 20, textAlign: 'center' },
  demo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  demoTitle: { fontSize: 14, fontWeight: '700', color: colors.primary },
  demoText: { fontSize: 12.5, color: colors.primaryDark, marginTop: 2 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.sm },
  footerText: { color: colors.textMuted, fontSize: 14 },
  footerAction: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.85 },
});
