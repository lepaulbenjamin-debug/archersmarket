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
import { SocialSignIn } from '@/components/SocialSignIn';

import { Field } from '@/components/Field';
import { Header, Screen } from '@/components/Screen';
import { colors, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp, refreshUser } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [city, setCity] = useState('');
  const [club, setClub] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Indiquez votre nom.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Adresse e-mail invalide.';
    if (password.length < 6) next.password = '6 caractères minimum.';
    if (!city.trim()) next.city = 'Indiquez votre ville.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    try {
      await signUp({ name, email, password, city, club: club || undefined });
      router.canGoBack() ? router.back() : router.replace('/');
    } catch (err) {
      setErrors({ email: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };


  /**
   * Après une connexion tierce, le profil peut être incomplet : Google ne
   * donne pas la ville, et Apple permet de masquer son nom. On termine
   * l'inscription plutôt que de laisser l'utilisateur buter dessus au
   * moment de publier.
   */
  const afterSocial = async (fullName?: string) => {
    const profil = await refreshUser();
    const incomplet = !profil?.city?.trim() || !profil?.name || profil.name === 'Archer';
    if (incomplet) {
      router.replace({ pathname: '/account/setup', params: fullName ? { suggested: fullName } : {} });
      return;
    }
    router.canGoBack() ? router.back() : router.replace('/');
  };

  return (
    <Screen>
      <Header title="Créer un compte" showBack />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>
            Rejoignez les archers qui achètent et revendent leur matériel en confiance.
          </Text>

          <Field
            label="Nom et prénom"
            placeholder="ex. Camille Fournier"
            value={name}
            onChangeText={setName}
            error={errors.name}
          />
          <Field
            label="Adresse e-mail"
            placeholder="vous@exemple.fr"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            error={errors.email}
          />
          <Field
            label="Mot de passe"
            placeholder="6 caractères minimum"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            error={errors.password}
          />
          <Field
            label="Ville"
            placeholder="ex. Nantes"
            value={city}
            onChangeText={setCity}
            error={errors.city}
          />
          <Field
            label="Club (optionnel)"
            placeholder="ex. Les Archers de la Loire"
            value={club}
            onChangeText={setClub}
          />

          <Button label="Créer mon compte" onPress={submit} loading={loading} />

          <SocialSignIn
            onDone={afterSocial}
            onError={(message) => setErrors({ email: message })}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Déjà inscrit ?</Text>
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
  intro: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  footerText: { color: colors.textMuted, fontSize: 14 },
  footerAction: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});
