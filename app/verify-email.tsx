import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Header, Screen } from '@/components/Screen';
import { resendConfirmation } from '@/services/auth';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';

/**
 * L'écran qui suit une inscription réussie.
 *
 * Il existe parce que la version précédente n'en avait pas : le compte était
 * créé, la confirmation attendue, et l'application le disait par une ligne
 * rouge sous le champ e-mail — au même endroit et dans la même couleur qu'une
 * adresse invalide. Personne ne lit ça comme une réussite.
 *
 * Ce que l'écran doit faire tenir : le compte existe, il manque un clic, ce
 * clic est dans un e-mail, et voici quoi faire s'il n'arrive pas. Le reste,
 * on l'enlève.
 *
 * L'archer n'a rien à faire ici une fois le lien suivi : celui-ci rouvre
 * l'application, `AuthContext` reprend les jetons et la session s'ouvre
 * seule. Le bouton « je me connecte » reste pour le cas où il aurait confirmé
 * depuis un ordinateur — c'est le seul chemin qui ne repasse pas par le
 * téléphone.
 */
export default function VerifyEmailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { email } = useLocalSearchParams<{ email?: string }>();

  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // La session s'est ouverte pendant qu'on lisait cet écran : le lien a été
  // suivi sur ce téléphone. Il n'y a plus rien à attendre.
  const confirme = Boolean(user);

  const renvoyer = async () => {
    if (!email) return;
    setEnvoi(true);
    setMessage(null);
    setErreur(null);
    try {
      await resendConfirmation(email);
      setMessage('E-mail renvoyé. Il arrive dans la minute.');
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  };

  if (confirme) {
    return (
      <Screen>
        <Header title="Compte confirmé" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.bandeau}>
            <View style={styles.rond}>
              <MaterialCommunityIcons
                name="check-decagram-outline"
                size={44}
                color={colors.primary}
              />
            </View>
            <Text style={styles.titre}>C’est bon, votre compte est actif</Text>
            <Text style={styles.texte}>
              Vous êtes connecté. Il n’y a plus rien à faire ici.
            </Text>
          </View>

          <Button
            label="Voir les annonces"
            icon="arrow-right"
            onPress={() => router.replace('/')}
          />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Plus qu’une étape" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.bandeau}>
          <View style={styles.rond}>
            <MaterialCommunityIcons name="email-check-outline" size={44} color={colors.primary} />
          </View>
          <Text style={styles.titre}>Votre compte est créé</Text>
          <Text style={styles.texte}>
            Nous venons d’envoyer un e-mail de confirmation
            {email ? ' à' : '.'}
          </Text>
          {email ? <Text style={styles.adresse}>{email}</Text> : null}
          <Text style={styles.texte}>
            Ouvrez-le et touchez le lien qu’il contient : l’application se rouvrira, connectée.
          </Text>
        </View>

        <View style={styles.aide}>
          <Text style={styles.aideTitre}>Rien reçu ?</Text>
          {[
            'L’e-mail met parfois une minute ou deux à arriver.',
            'Regardez dans les indésirables : c’est là qu’il finit le plus souvent.',
            'Vérifiez l’adresse ci-dessus — une lettre de travers et il part ailleurs.',
          ].map((ligne) => (
            <View key={ligne} style={styles.ligne}>
              <MaterialCommunityIcons
                name="circle-small"
                size={20}
                color={colors.textMuted}
              />
              <Text style={styles.ligneTexte}>{ligne}</Text>
            </View>
          ))}
        </View>

        {message ? <Text style={styles.succes}>{message}</Text> : null}
        {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

        {email ? (
          <Button
            label="Renvoyer l’e-mail"
            icon="email-sync-outline"
            variant="secondary"
            onPress={renvoyer}
            loading={envoi}
          />
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/login')}
          hitSlop={6}
        >
          <Text style={styles.lien}>J’ai confirmé depuis un ordinateur — me connecter</Text>
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => router.replace('/')} hitSlop={6}>
          <Text style={styles.lienDiscret}>Regarder les annonces en attendant</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  bandeau: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.xl,
  },
  rond: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  titre: { fontSize: 21, fontWeight: '800', color: colors.text, textAlign: 'center' },
  texte: { fontSize: 14, color: colors.textMuted, lineHeight: 20, textAlign: 'center' },
  adresse: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'center' },
  aide: { gap: spacing.xs },
  aideTitre: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  ligne: { flexDirection: 'row', alignItems: 'flex-start', gap: 2 },
  ligneTexte: { flex: 1, fontSize: 13.5, color: colors.textMuted, lineHeight: 19 },
  succes: { fontSize: 13.5, fontWeight: '600', color: colors.success, textAlign: 'center' },
  erreur: { fontSize: 13.5, fontWeight: '600', color: colors.danger, textAlign: 'center' },
  lien: { fontSize: 14, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  lienDiscret: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
  },
});
