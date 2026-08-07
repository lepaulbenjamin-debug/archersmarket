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
import { Header, Screen } from '@/components/Screen';
import { requestPasswordReset } from '@/services/auth';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';

/** Deux temps : on demande le code, puis on le saisit avec le nouveau mot de passe. */
type Step = 'ask' | 'confirm';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { resetPassword } = useAuth();

  const [step, setStep] = useState<Step>('ask');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Saisissez une adresse e-mail valide.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setStep('confirm');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (code.replace(/\s/g, '').length < 8) {
      setError('Le code compte huit chiffres.');
      return;
    }
    if (password.length < 6) {
      setError('Choisissez un mot de passe d’au moins 6 caractères.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await resetPassword(email, code, password);
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Header title="Mot de passe oublié" showBack />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {step === 'ask' ? (
            <>
              <View style={styles.intro}>
                <MaterialCommunityIcons name="email-fast-outline" size={30} color={colors.primary} />
                <Text style={styles.introTitle}>Recevoir un code</Text>
                <Text style={styles.introText}>
                  Saisissez l’adresse de votre compte. Nous vous envoyons un code à huit chiffres
                  pour choisir un nouveau mot de passe.
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
                error={error ?? undefined}
              />

              <Button label="Envoyer le code" icon="send-outline" onPress={ask} loading={loading} />
            </>
          ) : (
            <>
              <View style={styles.intro}>
                <MaterialCommunityIcons name="shield-key-outline" size={30} color={colors.primary} />
                <Text style={styles.introTitle}>Nouveau mot de passe</Text>
                <Text style={styles.introText}>
                  Si un compte existe pour {email.trim()}, un code vient d’y être envoyé. Il est
                  valable une heure.
                </Text>
              </View>

              <Field
                label="Code reçu par e-mail"
                placeholder="12345678"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={10}
                style={styles.code}
              />
              <Field
                label="Nouveau mot de passe"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                error={error ?? undefined}
                hint="Six caractères minimum."
              />

              <Button
                label="Changer le mot de passe"
                icon="check-circle-outline"
                onPress={confirm}
                loading={loading}
              />

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setStep('ask');
                  setCode('');
                  setError(null);
                }}
                hitSlop={6}
              >
                <Text style={styles.again}>Je n’ai rien reçu — renvoyer un code</Text>
              </Pressable>
            </>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>Vous vous en souvenez ?</Text>
            <Pressable accessibilityRole="button" onPress={() => router.replace('/login')} hitSlop={6}>
              <Text style={styles.footerAction}>Se connecter</Text>
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
  intro: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.xl,
    marginBottom: spacing.xs,
  },
  introTitle: { fontSize: 19, fontWeight: '800', color: colors.text },
  introText: { fontSize: 14, color: colors.textMuted, lineHeight: 20, textAlign: 'center' },
  code: { fontSize: 22, fontWeight: '700', letterSpacing: 6, textAlign: 'center' },
  again: { fontSize: 13, fontWeight: '600', color: colors.primary, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.sm },
  footerText: { color: colors.textMuted, fontSize: 14 },
  footerAction: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});
