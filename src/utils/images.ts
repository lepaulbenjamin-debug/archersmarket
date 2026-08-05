import type { ImageSource } from 'expo-image';

import { categoryImages } from '@/data/catalog';
import type { CategoryId } from '@/types';

/**
 * Une image d'annonce est soit une clé de visuel intégré (catégorie), soit
 * l'URI d'une photo choisie dans la galerie.
 */
export function imageSource(
  key: string | undefined,
  fallbackCategory: CategoryId,
): number | ImageSource {
  if (key && key in categoryImages) return categoryImages[key as CategoryId];
  if (key) return { uri: key };
  return categoryImages[fallbackCategory];
}
