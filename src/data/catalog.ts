import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

import type { CategoryId, ConditionId, Handedness, ReportReason, SortOption } from '@/types';

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
  { id: 'bow-recurve', label: 'Arc classique complet', short: 'Classique', icon: 'bow-arrow', specs: ['drawWeight', 'bowLength'] },
  { id: 'riser', label: 'Poignées', short: 'Poignées', icon: 'gesture-tap-hold', specs: ['bowLength'] },
  { id: 'limbs', label: 'Branches', short: 'Branches', icon: 'chart-bell-curve', specs: ['drawWeight', 'bowLength'] },
  { id: 'bow-compound', label: 'Arc à poulies', short: 'Poulies', icon: 'cog-outline', specs: ['drawWeight', 'drawLength'] },
  { id: 'bow-longbow', label: 'Arc traditionnel / longbow', short: 'Trad', icon: 'pine-tree', specs: ['drawWeight', 'bowLength'] },
  { id: 'arrows', label: 'Flèches & tubes', short: 'Flèches', icon: 'arrow-top-right', specs: ['spine'] },
  { id: 'arrow-parts', label: 'Pointes, plumes & encoches', short: 'Composants', icon: 'puzzle-outline', specs: ['spine'] },
  { id: 'sight', label: 'Viseurs & scopes', short: 'Viseurs', icon: 'target-variant', specs: [] },
  { id: 'rest', label: 'Repose-flèches & berger', short: 'Repose-flèche', icon: 'call-split', specs: [] },
  { id: 'stabilizer', label: 'Stabilisation', short: 'Stab', icon: 'ray-start-arrow', specs: ['size'] },
  { id: 'release', label: 'Décocheurs & palettes', short: 'Décocheur', icon: 'hand-back-right-outline', specs: ['size'] },
  { id: 'quiver', label: 'Carquois', short: 'Carquois', icon: 'bag-personal-outline', specs: [] },
  { id: 'protection', label: 'Protections', short: 'Protection', icon: 'shield-outline', specs: ['size'] },
  { id: 'string', label: 'Cordes & accessoires', short: 'Cordes', icon: 'vector-polyline', specs: ['bowLength'] },
  { id: 'tools', label: 'Outils & réglage', short: 'Outils', icon: 'wrench-outline', specs: [] },
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

/**
 * Marques présentes sur le marché français de l'occasion, regroupées par
 * famille pour que la recherche reste lisible. « Autre » ferme la marche :
 * un vendeur ne doit jamais être bloqué par une liste.
 */
export const brands = [
  // Arc classique — poignées et branches
  'Hoyt', 'Win&Win', 'WNS', 'MK Korea', 'Uukha', 'Border', 'Gillo', 'Spigarelli',
  'Fivics', 'Samick', 'SF Archery', 'Core Archery', 'Kinetic', 'Sanlida', 'Galaxy',
  'KAP', 'Best Archery', 'Krossen', 'Stellar',
  // Arc à poulies
  'Mathews', 'PSE', 'Elite', 'Bowtech', 'Prime', 'Hoyt Compound', 'Diamond', 'Martin', 'Mybo',
  // Traditionnel
  'Bear Archery', 'Ragim', 'Bearpaw', 'Buck Trail', 'Big Tradition', 'White Feather',
  // Flèches, tubes et composants
  'Easton', 'Skylon', 'Victory', 'Carbon Express', 'Gold Tip', 'Black Eagle',
  'Cross-X', 'Nijora', 'Penthalon', 'Aurel', 'Bohning', 'Beiter',
  // Viseurs et scopes
  'Shibuya', 'Axcel', 'Sure-Loc', 'CBE', 'HHA', 'Spot Hogg', 'Titan',
  // Stabilisation
  'Arc Systeme', 'Doinker', 'Bee Stinger', 'Fuse',
  // Décocheurs et repose-flèches
  'Carter', 'Scott', 'TruBall', 'AAE', 'Hamskea', 'QAD',
  // Cordes
  'BCY', 'Angel', 'Brownell', 'Flex Archery',
  // Accessoires, protections, cibles
  'Cartel', 'Decut', 'Avalon', 'Legend', 'Neet', 'JVD', 'Yate', 'Eleven', 'Egertec', 'Rinehart',
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
  riser: require('../../assets/listings/riser.png'),
  limbs: require('../../assets/listings/limbs.png'),
  rest: require('../../assets/listings/rest.png'),
  'arrow-parts': require('../../assets/listings/arrow-parts.png'),
  tools: require('../../assets/listings/tools.png'),
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

export const reportReasons: Array<{ id: ReportReason; label: string; hint: string }> = [
  {
    id: 'prohibited',
    label: 'Matériel interdit ou dangereux',
    hint: 'Arme prohibée, arc endommagé vendu comme sain, pointes de chasse sans précaution.',
  },
  {
    id: 'misleading',
    label: 'Annonce trompeuse',
    hint: 'État, marque ou caractéristiques ne correspondant pas au matériel.',
  },
  { id: 'counterfeit', label: 'Contrefaçon', hint: 'Copie vendue pour du matériel de marque.' },
  {
    id: 'scam',
    label: 'Tentative d’arnaque',
    hint: 'Paiement demandé hors de l’application, acompte suspect, coordonnées douteuses.',
  },
  { id: 'offensive', label: 'Propos offensants', hint: 'Insultes, harcèlement, contenu déplacé.' },
  { id: 'spam', label: 'Spam ou doublon', hint: 'Annonce répétée, publicité, hors sujet.' },
  { id: 'other', label: 'Autre motif', hint: 'Précisez ci-dessous.' },
];
