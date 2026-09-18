import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { BuyerPicker } from '@/components/BuyerPicker';
import { colors, radius, spacing } from '@/theme';
import { useListings } from '@/store/ListingsContext';
import { formatPrice } from '@/utils/format';
import type { Listing, ListingStatus } from '@/types';

interface Props {
  visible: boolean;
  listing: Listing | undefined;
  onClose: () => void;
  /** Après une vente conclue, pour que l'écran appelant rafraîchisse ses avis en attente. */
  onSold?: (buyerId: string | null) => void;
  /** L'annonce n'existe plus : l'écran qui la montrait doit partir. */
  onDeleted?: () => void;
}

/** Ce que chaque état autorise, et ce qu'on peut en dire au vendeur. */
const ETATS: Record<ListingStatus, { label: string; hint: string; couleur: string }> = {
  draft: {
    label: 'Brouillon',
    hint: 'Personne ne la voit encore.',
    couleur: colors.textMuted,
  },
  active: {
    label: 'En ligne',
    hint: 'Visible de tous, et les acheteurs peuvent vous contacter.',
    couleur: colors.primaryDark,
  },
  reserved: {
    label: 'Réservée',
    hint: 'Toujours visible, mais signalée comme promise à quelqu’un.',
    couleur: colors.textMuted,
  },
  sold: {
    label: 'Vendue',
    hint: 'Retirée de la recherche. Elle reste dans votre historique.',
    couleur: colors.textMuted,
  },
};

/**
 * Gérer une annonce, depuis l'annonce.
 *
 * Le bouton « Gérer mon annonce » renvoyait vers l'onglet Compte : on
 * atterrissait en haut d'une page longue, sans rapport visible avec l'annonce
 * qu'on venait de quitter. Gérer une annonce se fait là où on la regarde.
 */
export function ListingManageSheet({ visible, listing, onClose, onSold, onDeleted }: Props) {
  const router = useRouter();
  const { setStatus, removeListing } = useListings();
  const [designeAcheteur, setDesigneAcheteur] = useState(false);
  const [enCours, setEnCours] = useState(false);

  if (!listing) return null;

  const etat = ETATS[listing.status];

  const changerEtat = async (vers: ListingStatus) => {
    setEnCours(true);
    try {
      await setStatus(listing.id, vers);
      onClose();
    } catch (error) {
      Alert.alert('Mise à jour impossible', (error as Error).message);
    } finally {
      setEnCours(false);
    }
  };

  const conclureVente = async (buyerId: string | null) => {
    setDesigneAcheteur(false);
    try {
      await setStatus(listing.id, 'sold', buyerId);
      onSold?.(buyerId);
      onClose();
    } catch (error) {
      Alert.alert('Mise à jour impossible', (error as Error).message);
    }
  };

  const supprimer = () => {
    Alert.alert('Supprimer l’annonce', `« ${listing.title} » sera définitivement retirée.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeListing(listing.id);
            onClose();
            onDeleted?.();
          } catch (error) {
            Alert.alert('Suppression impossible', (error as Error).message);
          }
        },
      },
    ]);
  };

  return (
    <>
      {/*
        La désignation de l'acheteur est une feuille à part. On masque celle-ci
        pendant ce temps plutôt que d'empiler deux fenêtres modales : sur iOS,
        une modale ouverte depuis une modale s'ouvre parfois dans le vide.
      */}
      <Modal
        visible={visible && !designeAcheteur}
        animationType="slide"
        transparent
        onRequestClose={onClose}
      >
        <View style={styles.backdrop}>
          <Pressable style={styles.backdropTouch} onPress={onClose} accessibilityLabel="Fermer" />
          <View style={styles.sheet}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>Gérer l’annonce</Text>
                <Text style={styles.subject} numberOfLines={1}>
                  {listing.title}
                </Text>
              </View>
              <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
              <View style={styles.etat}>
                <View style={styles.etatLigne}>
                  <Text style={styles.etatLabel}>État</Text>
                  <Text style={[styles.etatValeur, { color: etat.couleur }]}>{etat.label}</Text>
                </View>
                <Text style={styles.etatHint}>{etat.hint}</Text>
              </View>

              <View style={styles.chiffres}>
                <Chiffre valeur={formatPrice(listing.price)} label="prix" />
                <Chiffre valeur={listing.views.toString()} label="vues" />
                <Chiffre valeur={listing.favoritesCount.toString()} label="en favori" />
              </View>

              {/*
                Une annonce vendue ne se modifie plus : l'acheteur a acheté ce
                qui y était décrit. La base le refuse aussi, et dit pourquoi.
              */}
              {listing.status === 'sold' ? null : (
                <Button
                  label="Modifier l’annonce"
                  icon="pencil-outline"
                  onPress={() => {
                    onClose();
                    router.push(`/listing/edit/${listing.id}`);
                  }}
                />
              )}

              {listing.status === 'active' ? (
                <Button
                  label="Marquer réservée"
                  icon="bookmark-outline"
                  variant="secondary"
                  loading={enCours}
                  onPress={() => changerEtat('reserved')}
                />
              ) : null}

              {listing.status === 'reserved' ? (
                <>
                  <Button
                    label="Marquer vendue"
                    icon="check-circle-outline"
                    variant="secondary"
                    loading={enCours}
                    onPress={() => setDesigneAcheteur(true)}
                  />
                  <Button
                    label="Annuler la réservation"
                    icon="undo-variant"
                    variant="secondary"
                    loading={enCours}
                    onPress={() => changerEtat('active')}
                  />
                </>
              ) : null}

              {listing.status === 'sold' || listing.status === 'draft' ? (
                <Button
                  label="Remettre en ligne"
                  icon="restore"
                  variant="secondary"
                  loading={enCours}
                  onPress={() => changerEtat('active')}
                />
              ) : null}

              <Button label="Supprimer l’annonce" icon="trash-can-outline" variant="danger" onPress={supprimer} />

              <Text style={styles.notice}>
                Marquer vendue vous demande qui a acheté : c’est ce qui vous permet, à tous les
                deux, de vous laisser un avis.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <BuyerPicker
        visible={designeAcheteur}
        listingId={listing.id}
        listingTitle={listing.title}
        onClose={() => setDesigneAcheteur(false)}
        onConfirm={conclureVente}
      />
    </>
  );
}

function Chiffre({ valeur, label }: { valeur: string; label: string }) {
  return (
    <View style={styles.chiffre}>
      <Text style={styles.chiffreValeur}>{valeur}</Text>
      <Text style={styles.chiffreLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  backdropTouch: { flex: 1 },
  sheet: {
    flexShrink: 1,
    maxHeight: '88%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  headerText: { flex: 1 },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },
  subject: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  body: { gap: spacing.sm, paddingBottom: spacing.md },
  etat: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  etatLigne: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  etatLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.04,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  etatValeur: { fontSize: 15, fontWeight: '800' },
  etatHint: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  chiffres: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  chiffre: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  chiffreValeur: { fontSize: 16, fontWeight: '800', color: colors.text },
  chiffreLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  notice: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18, marginTop: spacing.xs },
});
