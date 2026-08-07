import { publicPhotoUrl, toReview, type ReviewRow } from '@/services/mappers';
import { fail, supabase } from '@/services/supabase';
import type { CategoryId, PendingReview, Review } from '@/types';

const REVIEW_SELECT = 'id, listing_id, author_id, subject_id, rating, comment, created_at';

/** Avis reçus par un membre, du plus récent au plus ancien. */
export async function fetchReviews(subjectId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select(REVIEW_SELECT)
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) fail(error, 'Chargement des avis impossible.');
  return (data as ReviewRow[]).map(toReview);
}

export async function createReview(input: {
  listingId: string;
  authorId: string;
  subjectId: string;
  rating: number;
  comment?: string;
}): Promise<Review> {
  const { data, error } = await supabase
    .from('reviews')
    .insert({
      listing_id: input.listingId,
      author_id: input.authorId,
      subject_id: input.subjectId,
      rating: input.rating,
      comment: input.comment?.trim() || null,
    })
    .select(REVIEW_SELECT)
    .single();
  if (error || !data) {
    if (error?.code === '23505') throw new Error('Vous avez déjà noté cette transaction.');
    fail(error, 'Publication de l’avis impossible.');
  }
  return toReview(data as ReviewRow);
}

interface PendingRow {
  id: string;
  title: string;
  category: CategoryId;
  seller_id: string;
  buyer_id: string | null;
  listing_images: Array<{ path: string; position: number }> | null;
  reviews: Array<{ author_id: string }> | null;
}

/**
 * Ventes conclues auxquelles l'utilisateur a pris part et qu'il n'a pas encore
 * notées — dans un sens comme dans l'autre.
 */
export async function fetchPendingReviews(userId: string): Promise<PendingReview[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('id, title, category, seller_id, buyer_id, listing_images (path, position), reviews (author_id)')
    .eq('status', 'sold')
    .not('buyer_id', 'is', null)
    .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) fail(error, 'Chargement des ventes à noter impossible.');

  return (data as PendingRow[])
    .filter((row) => !(row.reviews ?? []).some((r) => r.author_id === userId))
    .map((row) => {
      const isSeller = row.seller_id === userId;
      const photo = (row.listing_images ?? []).sort((a, b) => a.position - b.position)[0];
      return {
        listingId: row.id,
        listingTitle: row.title,
        category: row.category,
        image: photo ? publicPhotoUrl(photo.path) : undefined,
        counterpartId: (isSeller ? row.buyer_id : row.seller_id) as string,
        role: isSeller ? 'seller' : 'buyer',
      };
    });
}

/** Acheteurs ayant contacté le vendeur au sujet d'une annonce. */
export async function fetchInterestedBuyers(listingId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('buyer_id')
    .eq('listing_id', listingId);
  if (error) fail(error, 'Chargement des acheteurs impossible.');
  return (data as Array<{ buyer_id: string }>).map((row) => row.buyer_id);
}
