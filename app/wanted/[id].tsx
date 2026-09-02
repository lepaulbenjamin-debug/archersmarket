import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Header, Screen } from '@/components/Screen';
import { depuis } from '@/components/WantedCard';
import { categoryById } from '@/data/catalog';
import { openConversation, sendMessage } from '@/services/messages';
import {
  closeWanted, deleteWanted, fetchWantedById, renewWanted, wantedMatches,
  type WantedRequest,
} from '@/services/wanted';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/store/AuthContext';
import { useListings } from '@/store/ListingsContext';
import type { Listing } from '@/types';

/**
 * Une recherche, et ce qu'on peut en faire.
 *
 * Deux écrans en un, parce que les deux rôles n'ont rien à faire au même
 * endroit. Celui qui cherche referme, relance ou supprime, et voit ce qui
 * existe déjà. Celui qui a peut-être l'objet propose une de ses annonces.
 *
 * Répondre passe par une annonce, et pas par un message libre : les
 * conversations sont ancrées à un objet dans toute l'application — c'est ce
 * qui permet à la commande, au litige et à la modération de savoir de quoi on
 * parle. Un fil sans objet serait le seul de l'application à ne mener nulle
 * part.
 */
export default function WantedDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { listings } = useListings();

  const [demande, setDemande] = useState<WantedRequest | null>(null);
  const [correspondances, setCorrespondances] = useState<Listing[]>([]);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!id) return;
    try {
      const trouvee = await fetchWantedById(id);
      setDemande(trouvee);
      if (trouvee) setCorrespondances(await wantedMatches(id).catch(() => []));
      setErreur(null);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setChargement(false);
    }
  }, [id]);

  useEffect(() => {
    charger();
  }, [charger]);

  const aMoi = Boolean(user && demande && demande.seekerId === user.id);

  /** Mes annonces actives dans la catégorie demandée. */
  const mesAnnonces = useMemo(() => {
    if (!user || !demande || aMoi) return [];
    return listings.filter(
      (l) => l.sellerId === user.id && l.status === 'active' && l.category === demande.category,
    );
  }, [aMoi, demande, listings, user]);

  const proposer = async (annonce: Listing) => {
    if (!user || !demande) return;
    setEnvoi(annonce.id);
    try {
      const conversation = await openConversation(annonce.id, demande.seekerId, user.id);
      await sendMessage(
        conversation.id,
        user.id,
        `Bonjour, vous cherchez « ${demande.title} ». J’ai peut-être ce qu’il vous faut.`,
      );
      router.push(`/chat/${conversation.id}`);
    } catch (err) {
      Alert.alert('Envoi impossible', (err as Error).message);
    } finally {
      setEnvoi(null);
    }
  };

  const fermer = (status: 'found' | 'closed') => {
    Alert.alert(
      status === 'found' ? 'Vous avez trouvé ?' : 'Fermer cette recherche',
      status === 'found'
        ? 'Elle quittera le fil et vous ne recevrez plus de propositions.'
        : 'Elle quittera le fil. Vous pourrez la relancer plus tard.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            await closeWanted(demande!.id, status).catch((err) =>
              Alert.alert('Impossible', (err as Error).message),
            );
            charger();
          },
        },
      ],
    );
  };

  const supprimer = () =>
    Alert.alert('Supprimer cette recherche', 'Elle disparaîtra définitivement.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteWanted(demande!.id).catch((err) =>
            Alert.alert('Impossible', (err as Error).message),
          );
          router.back();
        },
      },
    ]);

  if (chargement) {
    return (
      <Screen>
        <Header title="Recherche" showBack />
        <View style={styles.centre}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!demande) {
    return (
      <Screen>
        <Header title="Recherche" showBack />
        <EmptyState
          icon="text-search"
          title="Recherche introuvable"
          description={erreur ?? 'Elle a peut-être été fermée par son auteur.'}
        />
      </Screen>
    );
  }

  const categorie = categoryById(demande.category);
  const expiree = new Date(demande.expiresAt).getTime() < Date.now();

  return (
    <Screen>
      <Header title="Recherche" showBack />
      <ScrollView contentContainerStyle={styles.contenu} showsVerticalScrollIndicator={false}>
        <View style={styles.qui}>
          <Avatar name={demande.seekerName} color={demande.seekerColor ?? undefined} size={44} />
          <View style={styles.quiTexte}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/seller/${demande.seekerId}`)}
              hitSlop={6}
            >
              <Text style={styles.nom}>{demande.seekerName}</Text>
            </Pressable>
            <Text style={styles.meta}>
              {[demande.seekerCity, depuis(demande.createdAt)].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        <Text style={styles.titre}>{demande.title}</Text>

        <View style={styles.etiquette}>
          <MaterialCommunityIcons name={categorie.icon} size={15} color={colors.primaryDark} />
          <Text style={styles.etiquetteTexte}>{categorie.label}</Text>
        </View>

        {demande.detail ? <Text style={styles.detail}>{demande.detail}</Text> : null}

        <View style={styles.criteres}>
          {[
            demande.brands?.length ? ['tag-outline', demande.brands.join(', ')] : null,
            demande.handedness && demande.handedness !== 'na'
              ? ['hand-back-right-outline', demande.handedness === 'left' ? 'Gaucher' : 'Droitier']
              : null,
            demande.minDrawWeight != null || demande.maxDrawWeight != null
              ? [
                  'weight',
                  `${demande.minDrawWeight ?? '…'} à ${demande.maxDrawWeight ?? '…'} livres`,
                ]
              : null,
            demande.maxPrice != null
              ? ['cash-multiple', `Jusqu’à ${Math.round(demande.maxPrice)} €`]
              : null,
          ]
            .filter((x): x is [string, string] => x !== null)
            .map(([icone, texte]) => (
              <View key={texte} style={styles.critere}>
                <MaterialCommunityIcons
                  name={icone as never}
                  size={16}
                  color={colors.textFaint}
                />
                <Text style={styles.critereTexte}>{texte}</Text>
              </View>
            ))}
        </View>

        {aMoi ? (
          <>
            <View style={styles.separation} />
            <Text style={styles.section}>
              {correspondances.length > 0
                ? `${correspondances.length} annonce${correspondances.length > 1 ? 's' : ''} y répond${correspondances.length > 1 ? 'ent' : ''} déjà`
                : 'Aucune annonce n’y répond pour l’instant'}
            </Text>
            {correspondances.length === 0 ? (
              <Text style={styles.aide}>
                Vous serez prévenu dès qu’une annonce correspondante paraîtra, et les archers
                volontaires sur cette catégorie ont reçu votre demande.
              </Text>
            ) : (
              correspondances.map((annonce) => (
                <Pressable
                  key={annonce.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/listing/${annonce.id}`)}
                  style={styles.ligne}
                >
                  <View style={styles.ligneTexte}>
                    <Text style={styles.ligneTitre} numberOfLines={1}>
                      {annonce.title}
                    </Text>
                    <Text style={styles.lignePrix}>{Math.round(annonce.price)} €</Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color={colors.textFaint}
                  />
                </Pressable>
              ))
            )}

            <View style={styles.separation} />
            {demande.status === 'open' && !expiree ? (
              <>
                <Button
                  label="J’ai trouvé, merci"
                  icon="check-circle-outline"
                  onPress={() => fermer('found')}
                />
                <Button
                  label="Fermer sans avoir trouvé"
                  variant="secondary"
                  onPress={() => fermer('closed')}
                />
              </>
            ) : (
              <Button
                label="Relancer pour trente jours"
                icon="refresh"
                onPress={async () => {
                  await renewWanted(demande.id).catch((err) =>
                    Alert.alert('Impossible', (err as Error).message),
                  );
                  charger();
                }}
              />
            )}
            <Button label="Supprimer" variant="ghost" onPress={supprimer} />
          </>
        ) : (
          <>
            <View style={styles.separation} />
            <Text style={styles.section}>Vous avez ça ?</Text>

            {mesAnnonces.length > 0 ? (
              <>
                <Text style={styles.aide}>
                  Proposez une de vos annonces : la conversation s’ouvre dessus, et
                  {' '}
                  {demande.seekerName} voit immédiatement de quoi il s’agit.
                </Text>
                {mesAnnonces.map((annonce) => (
                  <Pressable
                    key={annonce.id}
                    accessibilityRole="button"
                    onPress={() => proposer(annonce)}
                    disabled={envoi !== null}
                    style={styles.ligne}
                  >
                    <View style={styles.ligneTexte}>
                      <Text style={styles.ligneTitre} numberOfLines={1}>
                        {annonce.title}
                      </Text>
                      <Text style={styles.lignePrix}>{Math.round(annonce.price)} €</Text>
                    </View>
                    {envoi === annonce.id ? (
                      <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                      <MaterialCommunityIcons name="send-outline" size={18} color={colors.primary} />
                    )}
                  </Pressable>
                ))}
              </>
            ) : (
              <Text style={styles.aide}>
                Vous n’avez pas d’annonce active dans « {categorie.label} ». Publiez-la, et
                {' '}
                {demande.seekerName} sera prévenu automatiquement si elle correspond.
              </Text>
            )}

            <Button
              label="Publier une annonce"
              icon="plus-box"
              variant={mesAnnonces.length > 0 ? 'secondary' : 'primary'}
              onPress={() => router.push('/(tabs)/sell')}
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  contenu: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  qui: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  quiTexte: { flex: 1 },
  nom: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12.5, color: colors.textFaint },
  titre: { fontSize: 22, fontWeight: '800', color: colors.text, lineHeight: 28 },
  etiquette: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  etiquetteTexte: { fontSize: 12.5, fontWeight: '700', color: colors.primaryDark },
  detail: { fontSize: 15, color: colors.text, lineHeight: 22 },
  criteres: { gap: spacing.sm, marginTop: spacing.xs },
  critere: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  critereTexte: { fontSize: 14, color: colors.textMuted },
  separation: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  section: { fontSize: 16, fontWeight: '700', color: colors.text },
  aide: { fontSize: 13.5, color: colors.textMuted, lineHeight: 19 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  ligneTexte: { flex: 1 },
  ligneTitre: { fontSize: 14, fontWeight: '600', color: colors.text },
  lignePrix: { fontSize: 13, fontWeight: '700', color: colors.primaryDark, marginTop: 2 },
});
