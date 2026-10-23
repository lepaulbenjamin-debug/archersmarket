import * as Clipboard from 'expo-clipboard';
import { Alert, Platform, Share } from 'react-native';

import { formatPrice } from '@/utils/format';
import type { Listing, User } from '@/types';

/**
 * Partager une annonce, ou toutes les annonces d'un vendeur.
 *
 * Le partage n'envoyait que du texte — « Viseur Arc Système — 130 € sur
 * Archers Market » — sans aucun lien : la personne qui le recevait ne pouvait
 * rien en faire. Chaque annonce et chaque vendeur ont maintenant leur adresse
 * sur le site, qui s'ouvre partout, application installée ou non.
 */

export const SITE = 'https://archersmarket.fr';
export const lienAnnonce = (id: string) => `${SITE}/listing/${id}`;
export const lienVendeur = (id: string) => `${SITE}/seller/${id}`;

async function partager({ titre, message, url }: { titre: string; message: string; url: string }) {
  if (Platform.OS === 'web') {
    // Le partage natif du navigateur, là où il existe — sur téléphone surtout.
    const nav = navigator as Navigator & { share?: (donnees: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: titre, text: message, url });
        return;
      } catch (erreur) {
        // Fermer la feuille de partage n'est pas un échec.
        if ((erreur as Error).name === 'AbortError') return;
      }
    }
    // Sur un ordinateur, le plus souvent : le lien part dans le presse-papiers.
    await Clipboard.setStringAsync(url);
    Alert.alert('Lien copié', `${url}\n\nCollez-le là où vous voulez le partager.`);
    return;
  }

  // Sur iOS, le lien à part : c'est ce qui donne un aperçu dans Messages ou
  // WhatsApp. Android ne connaît que le texte : le lien y est ajouté.
  await Share.share(
    Platform.OS === 'ios' ? { title: titre, message, url } : { title: titre, message: `${message}\n${url}` },
  ).catch(() => undefined);
}

export function partagerAnnonce(annonce: Listing) {
  return partager({
    titre: annonce.title,
    message: `${annonce.title} — ${formatPrice(annonce.price)} sur Archers Market`,
    url: lienAnnonce(annonce.id),
  });
}

export function partagerVendeur(vendeur: User, nombreAnnonces: number) {
  const annonces = nombreAnnonces > 1 ? `ses ${nombreAnnonces} annonces` : 'ses annonces';
  return partager({
    titre: `Les annonces de ${vendeur.name}`,
    message: `${vendeur.name} vend du matériel de tir à l’arc sur Archers Market — ${annonces}`,
    url: lienVendeur(vendeur.id),
  });
}
