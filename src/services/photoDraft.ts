import * as ImagePicker from 'expo-image-picker';

import { edgeBody, supabase } from '@/services/supabase';
import type { Cents } from '@/services/payments';
import type { CategoryId, ConditionId } from '@/types';

/**
 * Un brouillon d'annonce déduit d'une photo.
 *
 * Ce que la photo ne dit pas reste nul, et l'écran laisse le champ vide. Deux
 * absences sont volontaires plutôt que subies :
 *
 * — la latéralité, qu'on ne déduit jamais d'une image : elle s'inverse selon
 *   le côté d'où la photo est prise, et une poignée annoncée droitière alors
 *   qu'elle est gauchère est inutilisable pour l'acheteur ;
 * — le prix, qui ne vient pas du modèle mais de nos propres annonces.
 */
export interface PhotoDraft {
  category: CategoryId | null;
  brand: string | null;
  condition: ConditionId | null;
  title: string;
  description: string;
  specs: {
    drawWeight: string | null;
    bowLength: string | null;
    drawLength: string | null;
    spine: string | null;
    size: string | null;
  };
  /** Dommage visible touchant à la sécurité, à confirmer par le vendeur. */
  damage: string | null;
  price: PriceRange | null;
  analysesLeft: number;
  /** L'image analysée, pour l'ajouter à l'annonce sans la reprendre. */
  uri: string;
}

/**
 * Une fourchette observée sur nos annonces, jamais une estimation.
 *
 * `sample` est affiché avec : un prix médian sans le nombre de comparables
 * derrière n'est qu'un chiffre de plus, et le vendeur ne peut pas juger s'il
 * doit le croire.
 */
export interface PriceRange {
  sample: number;
  low: Cents;
  median: Cents;
  high: Cents;
  /** `brand` quand la fourchette porte sur la même marque, `category` sinon. */
  scope: 'brand' | 'category';
}

/**
 * Prend une photo dans la galerie et en tire un brouillon.
 *
 * La qualité est volontairement basse : au-delà, l'envoi s'allonge sans que
 * la lecture s'améliore — c'est la sérigraphie sur la poignée qu'il faut
 * pouvoir lire, pas le grain du carbone.
 */
export async function draftFromPhoto(): Promise<PhotoDraft | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Autorisez l’accès à la galerie pour analyser une photo.');
  }

  const choix = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.5,
    base64: true,
    allowsMultipleSelection: false,
  });
  if (choix.canceled || !choix.assets?.length) return null;

  const asset = choix.assets[0];
  if (!asset.base64) throw new Error('Photo illisible.');

  const { data, error } = await supabase.functions.invoke('listing-from-photo', {
    body: { photo: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' },
  });
  if (error) {
    // Une photo qui ne montre pas de matériel n'est pas un échec technique :
    // le serveur l'a reconnue comme telle, n'a rien décompté du quota, et le
    // message dit quoi faire. On le remonte tel quel.
    const corps = await edgeBody(error);
    throw new Error(corps?.error ?? 'Analyse impossible pour le moment.');
  }

  const payload = data as Omit<PhotoDraft, 'uri'> & { error?: string };
  if (payload?.error) throw new Error(payload.error);

  return { ...payload, uri: asset.uri };
}

/** Ce qu'il reste d'analyses aujourd'hui, pour l'annoncer avant de proposer. */
export async function analysesLeft(): Promise<number> {
  const { data, error } = await supabase.rpc('photo_analyses_left');
  if (error) return 0;
  return Number(data ?? 0);
}
