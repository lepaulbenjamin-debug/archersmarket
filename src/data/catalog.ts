import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

import type { CategoryId, ConditionId, Handedness, SortOption } from '@/types';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface Category {
  id: CategoryId;
  label: string;
  short: string;
  icon: IconName;
  /** Champs techniques pertinents pour cette catégorie. */
  specs: Array<'drawWeight' | 'bowLength' | 'drawLength' | 'spine' | 'size'>;
}

export const categories: Category[] = [
  { id: 'bow-recurve', label: 'Arc classique', short: 'Classique', icon: 'bow-arrow', specs: ['drawWeight', 'bowLength'] },
  { id: 'bow-compound', label: 'Arc à poulies', short: 'Poulies', icon: 'cog-outline', specs: ['drawWeight', 'drawLength'] },
  { id: 'bow-longbow', label: 'Arc traditionnel / longbow', short: 'Trad', icon: 'pine-tree', specs: ['drawWeight', 'bowLength'] },
  { id: 'arrows', label: 'Flèches & tubes', short: 'Flèches', icon: 'arrow-top-right', specs: ['spine'] },
  { id: 'sight', label: 'Viseurs & scopes', short: 'Viseurs', icon: 'target-variant', specs: [] },
  { id: 'stabilizer', label: 'Stabilisation', short: 'Stab', icon: 'ray-start-arrow', specs: ['size'] },
  { id: 'release', label: 'Décocheurs & palettes', short: 'Décocheur', icon: 'hand-back-right-outline', specs: ['size'] },
  { id: 'quiver', label: 'Carquois', short: 'Carquois', icon: 'bag-personal-outline', specs: [] },
  { id: 'protection', label: 'Protections', short: 'Protection', icon: 'shield-outline', specs: ['size'] },
  { id: 'string', label: 'Cordes & accessoires', short: 'Cordes', icon: 'vector-polyline', specs: ['bowLength'] },
  { id: 'target', label: 'Cibles & blasons', short: 'Cibles', icon: 'bullseye-arrow', specs: ['size'] },
  { id: 'apparel', label: 'Textile & bagagerie', short: 'Textile', icon: 'tshirt-crew-outline', specs: ['size'] },
];

export const categoryById = (id: CategoryId): Category =>
  categories.find((c) => c.id === id) ?? categories[0];

export interface Condition {
  id: ConditionId;
  label: string;
  hint: string;
}

export const conditions: Condition[] = [
  { id: 'new', label: 'Neuf', hint: 'Jamais utilisé, emballage d’origine' },
  { id: 'like-new', label: 'Comme neuf', hint: 'Monté une ou deux fois, aucune marque' },
  { id: 'very-good', label: 'Très bon état', hint: 'Traces d’usage légères' },
  { id: 'good', label: 'Bon état', hint: 'Rayures visibles, fonctionne parfaitement' },
  { id: 'fair', label: 'État correct', hint: 'Usure marquée ou pièce à réviser' },
];

export const conditionById = (id: ConditionId): Condition =>
  conditions.find((c) => c.id === id) ?? conditions[2];

export const brands = [
  'Hoyt',
  'Win&Win',
  'MK Korea',
  'Uukha',
  'Border',
  'Gillo',
  'Spigarelli',
  'Fivics',
  'Samick',
  'Kinetic',
  'Mathews',
  'PSE',
  'Elite',
  'Bear Archery',
  'Easton',
  'Skylon',
  'Victory',
  'Beiter',
  'Shibuya',
  'Axcel',
  'Arc Systeme',
  'Cartel',
  'Decut',
  'Avalon',
  'Legend',
  'Bohning',
  'Autre',
];

export const handednessOptions: Array<{ id: Handedness; label: string }> = [
  { id: 'right', label: 'Droitier' },
  { id: 'left', label: 'Gaucher' },
  { id: 'na', label: 'Indifférent' },
];

export const handednessLabel = (h: Handedness): string =>
  handednessOptions.find((o) => o.id === h)?.label ?? 'Indifférent';

export const sortOptions: Array<{ id: SortOption; label: string }> = [
  { id: 'recent', label: 'Plus récentes' },
  { id: 'price-asc', label: 'Prix croissant' },
  { id: 'price-desc', label: 'Prix décroissant' },
  { id: 'popular', label: 'Les plus vues' },
];

/** Visuels locaux : l'app reste illustrée même sans réseau. */
export const categoryImages: Record<CategoryId, number> = {
  'bow-recurve': require('../../assets/listings/bow-recurve.png'),
  'bow-compound': require('../../assets/listings/bow-compound.png'),
  'bow-longbow': require('../../assets/listings/bow-longbow.png'),
  arrows: require('../../assets/listings/arrows.png'),
  sight: require('../../assets/listings/sight.png'),
  stabilizer: require('../../assets/listings/stabilizer.png'),
  release: require('../../assets/listings/release.png'),
  quiver: require('../../assets/listings/quiver.png'),
  protection: require('../../assets/listings/protection.png'),
  string: require('../../assets/listings/string.png'),
  target: require('../../assets/listings/target.png'),
  apparel: require('../../assets/listings/apparel.png'),
};
