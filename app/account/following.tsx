import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Header, Screen } from '@/components/Screen';
import { fetchFollowedSellers, unfollow } from '@/services/follows';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';

/**
 * Les vendeurs que l'on suit.
 *
 * On y vient pour retrouver une boutique, ou pour arrêter d'être prévenu. Le
 * nombre d'annonces en ligne de chacun dit d'un coup d'œil qui a du nouveau.
 */
export default function FollowingScreen() {
  const router = useRouter();
  const { user, userById } = useAuth();
  const { listingsBySeller } = useListings();
  const [vendeurs, setVendeurs] = useState<string[]>([]);
  const [chargement, setChargement] = useState(true);
  const [indisponible, setIndisponible] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      setChargement(true);
      fetchFollowedSellers(user.id)
        .then((ids) => {
          setVendeurs(ids);
          setIndisponible(false);
        })
        .catch(() => setIndisponible(true))
        .finally(() => setChargement(false));
    }, [user]),
  );

  const neplusSuivre = (id: string, nom: string) => {
    if (!user) return;
    Alert.alert(`Ne plus suivre ${nom} ?`, 'Vous ne serez plus prévenu de ses nouvelles annonces.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Ne plus suivre',
        style: 'destructive',
        onPress: async () => {
          setEnCours(id);
          try {
            await unfollow(user.id, id);
            setVendeurs((prev) => prev.filter((v) => v !== id));
          } catch (erreur) {
            Alert.alert('Désabonnement impossible', (erreur as Error).message);
          } finally {
            setEnCours(null);
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <Header title="Vendeurs suivis" showBack />
      {chargement ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : indisponible ? (
        <EmptyState
          icon="cloud-off-outline"
          title="Abonnements indisponibles"
          description="Réessayez dans un instant."
        />
      ) : vendeurs.length === 0 ? (
        <EmptyState
          icon="account-heart-outline"
          title="Vous ne suivez personne"
          description="Sur le profil d’un vendeur, touchez « Suivre » : vous serez prévenu dès qu’il publie une annonce."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {vendeurs.map((id) => {
            const vendeur = userById(id);
            const nom = vendeur?.name ?? 'Membre';
            const enLigne = listingsBySeller(id).filter((l) => l.status === 'active').length;
            return (
              <View key={id} style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Voir le profil de ${nom}`}
                  onPress={() => router.push(`/seller/${id}`)}
                  style={({ pressed }) => [styles.identite, pressed && styles.pressed]}
                >
                  <Avatar name={nom} color={vendeur?.avatarColor ?? colors.primary} size={40} />
                  <View style={styles.texte}>
                    <Text style={styles.nom} numberOfLines={1}>
                      {nom}
                    </Text>
                    <Text style={styles.detail} numberOfLines={1}>
                      {[vendeur?.city, `${enLigne} annonce${enLigne > 1 ? 's' : ''} en ligne`]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textFaint} />
                </Pressable>
                <Button
                  label="Ne plus suivre"
                  variant="ghost"
                  size="sm"
                  loading={enCours === id}
                  onPress={() => neplusSuivre(id, nom)}
                />
              </View>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing.xxl },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  identite: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  texte: { flex: 1 },
  nom: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  detail: { fontSize: 12.5, color: colors.textFaint, marginTop: 1 },
  pressed: { opacity: 0.7 },
});
