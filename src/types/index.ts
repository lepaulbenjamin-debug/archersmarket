/** Modèle de données d'Archers Market. */

export type CategoryId =
  | 'bow-recurve'
  | 'bow-compound'
  | 'bow-longbow'
  | 'arrows'
  | 'sight'
  | 'stabilizer'
  | 'release'
  | 'quiver'
  | 'protection'
  | 'string'
  | 'target'
  | 'apparel';

export type ConditionId = 'new' | 'like-new' | 'very-good' | 'good' | 'fair';

export type Handedness = 'right' | 'left' | 'na';

export type ListingStatus = 'active' | 'reserved' | 'sold';

export interface User {
  id: string;
  name: string;
  handle: string;
  email: string;
  /** Uniquement pour le mock local : jamais un vrai backend d'auth. */
  password?: string;
  city: string;
  club?: string;
  bio?: string;
  avatarColor: string;
  rating: number;
  reviewCount: number;
  memberSince: string;
  discipline?: string;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  /** Prix d'origine, pour afficher une remise. */
  originalPrice?: number;
  category: CategoryId;
  brand: string;
  condition: ConditionId;
  handedness: Handedness;
  /** Puissance en livres (arcs, branches). */
  drawWeight?: number;
  /** Longueur d'arc en pouces (66, 68, 70…). */
  bowLength?: number;
  /** Allonge en pouces (arcs à poulies). */
  drawLength?: number;
  /** Spine des flèches (500, 600…). */
  spine?: number;
  size?: string;
  sellerId: string;
  city: string;
  shipping: boolean;
  shippingPrice?: number;
  /** Clé de visuel intégré (voir categoryImages) ou URI d'une photo choisie. */
  images: string[];
  status: ListingStatus;
  createdAt: string;
  views: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  /** Offre de prix attachée au message, le cas échéant. */
  offer?: number;
  createdAt: string;
}

export interface Conversation {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  updatedAt: string;
  /** Ids des participants ayant lu la conversation jusqu'à updatedAt. */
  readBy: string[];
}

export interface ListingFilters {
  query?: string;
  categories?: CategoryId[];
  conditions?: ConditionId[];
  brands?: string[];
  handedness?: Handedness;
  minPrice?: number;
  maxPrice?: number;
  minDrawWeight?: number;
  maxDrawWeight?: number;
  shippingOnly?: boolean;
  sort?: SortOption;
}

export type SortOption = 'recent' | 'price-asc' | 'price-desc' | 'popular';

export interface NewListingInput {
  title: string;
  description: string;
  price: number;
  category: CategoryId;
  brand: string;
  condition: ConditionId;
  handedness: Handedness;
  drawWeight?: number;
  bowLength?: number;
  drawLength?: number;
  spine?: number;
  size?: string;
  city: string;
  shipping: boolean;
  shippingPrice?: number;
  images?: string[];
}
