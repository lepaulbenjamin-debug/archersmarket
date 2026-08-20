import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Header, Screen } from '@/components/Screen';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';

/**
 * Complète un profil arrivé par Apple ou Google.
 *
 * Ces fournisseurs donnent une adresse e-mail et, quand l'utilisateur le veut
 * bien, un nom. Jamais la ville — or elle figure sur chaque annonce et sert
 * aux acheteurs qui cherchent près de chez eux. Autant la demander tout de
 * suite plutôt qu'au milieu de la première publication.
 */
export default function ProfileSetupScreen() {
  const router = useRouter();
  const { user, updateProfile } = useAuth();
  const { suggested } = useLocalSearchParams<{ suggested?: string }>();

  const [name, setName] = useState(
    user?.name && user.name !== 'Archer' ? user.name : (suggested ?? ''),
  );
  const [city, setCity] = useState(user?.city ?? '');
  const [club, setClub] = useState(user?.club ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2) {
      setError('Indiquez le nom sous lequel les autres archers vous verront.');
      return;
    }
    if (!city.trim()) {
      setError('La ville figure sur vos annonces : elle est nécessaire.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), city: city.trim(), club: club.trim() || undefined });
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Header title="Bienvenue" subtitle="Deux informations et c’est parti" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <Text style={styles.introText}>
              Votre compte est créé. Il ne manque que ce que votre fournisseur de connexion ne nous
              transmet pas.
            </Text>
          </View>

          <Field
            label="Nom affiché"
            placeholder="ex. Camille Fournier"
            value={name}
            onChangeText={setName}
            hint="Visible par les autres membres sur vos annonces et vos messages."
          />
          <Field
            label="Ville"
            placeholder="ex. Nantes"
            value={city}
            onChangeText={setCity}
            hint="Elle apparaît sur vos annonces, pour les remises en main propre."
          />
          <Field
            label="Club (facultatif)"
            placeholder="ex. Compagnie d’Arc de Nantes"
            value={club}
            onChangeText={setClub}
            error={error ?? undefined}
          />

          <Button label="Terminer" icon="check-circle-outline" onPress={submit} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  intro: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.lg },
  introText: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
});
