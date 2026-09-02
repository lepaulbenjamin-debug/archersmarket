import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View,
} from 'react-native';

import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { Header, Screen } from '@/components/Screen';
import { WantedCard } from '@/components/WantedCard';
import { categories } from '@/data/catalog';
import { fetchMyWanted, fetchWanted, type WantedRequest } from '@/services/wanted';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import type { CategoryId } from '@/types';

/**
 * Ce que les autres cherchent.
 *
 * Le pendant du fil d'annonces, dans l'autre sens. Il existe parce qu'un
 * marché d'occasion se bloque toujours du même côté : il y a des gens qui
 * cherchent une poignée 25 pouces depuis six mois, et des gens qui en ont une
 * au fond d'un placard sans savoir qu'elle intéresse quelqu'un.
 */
export default function WantedFeedScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [demandes, setDemandes] = useState<WantedRequest[]>([]);
  const [categorie, setCategorie] = useState<CategoryId | null>(null);
  // « Les miennes » sort du filtre par catégorie : on y veut aussi celles
  // qu'on a refermées, pour pouvoir les relancer.
  const [lesMiennes, setLesMiennes] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [rafraichit, setRafraichit] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setDemandes(
        lesMiennes && user
          ? await fetchMyWanted(user.id)
          : await fetchWanted(categorie ?? undefined),
      );
      setErreur(null);
    } catch (err) {
      setErreur((err as Error).message);
    }
  }, [categorie, lesMiennes, user]);

  // Au retour d'une publication, le fil doit déjà la contenir.
  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      (async () => {
        setChargement(true);
        await charger();
        if (vivant) setChargement(false);
      })();
      return () => {
        vivant = false;
      };
    }, [charger]),
  );

  const publier = () => {
    if (!user) {
      router.push('/login');
      return;
    }
    router.push('/wanted/new');
  };

  const entete = (
    <View style={styles.entete}>
      <Text style={styles.intro}>
        Ce que les archers cherchent en ce moment. Si vous l’avez au fond d’un placard, c’est
        le moment de le dire.
      </Text>

      <View style={styles.filtres}>
        <Chip
          label="Tout"
          selected={categorie === null && !lesMiennes}
          onPress={() => {
            setLesMiennes(false);
            setCategorie(null);
          }}
        />
        {user ? (
          <Chip
            label="Les miennes"
            icon="account-outline"
            selected={lesMiennes}
            onPress={() => {
              setLesMiennes((prev) => !prev);
              setCategorie(null);
            }}
          />
        ) : null}
        {categories.map((c) => (
          <Chip
            key={c.id}
            label={c.short}
            icon={c.icon}
            selected={categorie === c.id && !lesMiennes}
            onPress={() => {
              setLesMiennes(false);
              setCategorie(categorie === c.id ? null : c.id);
            }}
          />
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => (user ? router.push('/account/wanted-alerts') : router.push('/login'))}
        style={styles.volontaire}
      >
        <MaterialCommunityIcons name="bell-ring-outline" size={18} color={colors.primaryDark} />
        <Text style={styles.volontaireTexte}>
          Être prévenu quand on cherche ce que vous vendez
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color={colors.primaryDark} />
      </Pressable>
    </View>
  );

  return (
    <Screen>
      <Header
        title="Recherches"
        showBack
        right={
          <Pressable accessibilityRole="button" onPress={publier} hitSlop={8}>
            <MaterialCommunityIcons name="plus-circle" size={26} color={colors.primary} />
          </Pressable>
        }
      />

      {chargement ? (
        <View style={styles.centre}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={demandes}
          keyExtractor={(d) => d.id}
          ListHeaderComponent={entete}
          contentContainerStyle={styles.liste}
          ItemSeparatorComponent={() => <View style={styles.separateur} />}
          refreshControl={
            <RefreshControl
              refreshing={rafraichit}
              onRefresh={async () => {
                setRafraichit(true);
                await charger();
                setRafraichit(false);
              }}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <WantedCard demande={item} onPress={() => router.push(`/wanted/${item.id}`)} />
          )}
          ListEmptyComponent={
            erreur ? (
              <EmptyState
                icon="cloud-off-outline"
                title="Chargement impossible"
                description={erreur}
                actionLabel="Réessayer"
                onAction={charger}
              />
            ) : (
              <EmptyState
                icon="text-search"
                title={
                  lesMiennes
                    ? 'Vous ne cherchez rien pour l’instant'
                    : categorie
                      ? 'Rien dans cette catégorie'
                      : 'Personne ne cherche encore'
                }
                description={
                  lesMiennes
                    ? 'Dites ce que vous cherchez : les archers volontaires sur cette catégorie seront prévenus.'
                    : categorie
                      ? 'Essayez une autre catégorie, ou publiez la vôtre.'
                      : 'Soyez le premier à dire ce que vous cherchez : les vendeurs volontaires seront prévenus.'
                }
                actionLabel="Publier une recherche"
                onAction={publier}
              />
            )
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  liste: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  separateur: { height: spacing.md },
  entete: { gap: spacing.md, paddingBottom: spacing.md },
  intro: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  filtres: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  volontaire: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  volontaireTexte: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.primaryDark },
});
