import { LISTING_PHOTOS_BUCKET, supabase } from '@/services/supabase';
import type { Conversation, Listing, Message, Review, User } from '@/types';

/** Lignes telles que renvoyées par PostgREST (snake_case). */
export interface ProfileRow {
  id: string;
  handle: string;
  name: string;
  city: string;
  club: string | null;
  bio: string | null;
  discipline: string | null;
  avatar_color: string;
  rating: number | string;
  review_count: number;
  created_at: string;
}

export interface ListingRow {
  id: string;
  seller_id: string;
  buyer_id?: string | null;
  title: string;
  description: string;
  price: number | string;
  original_price: number | string | null;
  category: Listing['category'];
  brand: string;
  condition: Listing['condition'];
  hand: Listing['handedness'];
  draw_weight: number | string | null;
  bow_length: number | string | null;
  draw_length: number | string | null;
  spine: number | null;
  size: string | null;
  city: string;
  shipping: boolean;
  shipping_price: number | string | null;
  status: Listing['status'];
  views: number;
  created_at: string;
  listing_images?: Array<{ path: string; position: number }>;
}

export interface ConversationRow {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  updated_at: string;
}

export interface ReviewRow {
  id: string;
  listing_id: string;
  author_id: string;
  subject_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  offer: number | string | null;
  created_at: string;
}

const num = (value: number | string | null | undefined): number | undefined => {
  if (value === null || value === undefined) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export const publicPhotoUrl = (path: string): string =>
  supabase.storage.from(LISTING_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;

export function toUser(row: ProfileRow, email?: string): User {
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    email,
    city: row.city,
    club: row.club ?? undefined,
    bio: row.bio ?? undefined,
    discipline: row.discipline ?? undefined,
    avatarColor: row.avatar_color,
    rating: num(row.rating) ?? 0,
    reviewCount: row.review_count,
    memberSince: row.created_at,
  };
}

export function toListing(row: ListingRow): Listing {
  const photos = (row.listing_images ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((image) => publicPhotoUrl(image.path));

  return {
    id: row.id,
    sellerId: row.seller_id,
    buyerId: row.buyer_id ?? undefined,
    title: row.title,
    description: row.description,
    price: num(row.price) ?? 0,
    originalPrice: num(row.original_price),
    category: row.category,
    brand: row.brand,
    condition: row.condition,
    handedness: row.hand,
    drawWeight: num(row.draw_weight),
    bowLength: num(row.bow_length),
    drawLength: num(row.draw_length),
    spine: row.spine ?? undefined,
    size: row.size ?? undefined,
    city: row.city,
    shipping: row.shipping,
    shippingPrice: num(row.shipping_price),
    // Sans photo, l'app retombe sur le visuel de la catégorie.
    images: photos.length ? photos : [row.category],
    status: row.status,
    createdAt: row.created_at,
    views: row.views,
  };
}

export function toConversation(row: ConversationRow, readAt: string | null): Conversation {
  return {
    id: row.id,
    listingId: row.listing_id,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    updatedAt: row.updated_at,
    readAt,
  };
}

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    text: row.body,
    offer: num(row.offer),
    createdAt: row.created_at,
  };
}

export function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    listingId: row.listing_id,
    authorId: row.author_id,
    subjectId: row.subject_id,
    rating: row.rating,
    comment: row.comment ?? undefined,
    createdAt: row.created_at,
  };
}

/** Colonnes sélectionnées pour une annonce, photos comprises. */
export const LISTING_SELECT = '*, listing_images (path, position)';
