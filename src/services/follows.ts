import { fail, supabase } from '@/services/supabase';

/**
 * Suivre un vendeur : être prévenu quand il publie.
 *
 * Les abonnements vivent en base (`follows`, migration 0045). Chacun n'y lit
 * que les siens ; le nombre d'abonnés d'un vendeur passe par une fonction.
 */

export interface FollowState {
  following: boolean;
  followers: number;
}

/**
 * L'état d'abonnement à un vendeur, ou `null` si la fonction n'est pas
 * disponible.
 *
 * `null` plutôt qu'une erreur : l'application peut être publiée avant que la
 * migration soit appliquée — le site se reconstruit seul à chaque fusion. Dans
 * ce cas, l'écran masque simplement le bouton, au lieu d'afficher une erreur
 * sur le profil de chaque vendeur.
 */
export async function fetchFollowState(sellerId: string, userId?: string): Promise<FollowState | null> {
  const compte = await supabase.rpc('follower_count', { seller: sellerId });
  if (compte.error) return null;

  let following = false;
  if (userId) {
    const { data, error } = await supabase
      .from('follows')
      .select('seller_id')
      .eq('follower_id', userId)
      .eq('seller_id', sellerId)
      .maybeSingle();
    if (error) return null;
    following = !!data;
  }
  return { following, followers: Number(compte.data ?? 0) };
}

export async function follow(userId: string, sellerId: string): Promise<void> {
  const { error } = await supabase.from('follows').insert({ follower_id: userId, seller_id: sellerId });
  // Déjà abonné — un double appui, deux appareils : l'état voulu est atteint.
  if (error && error.code !== '23505') fail(error, 'Abonnement impossible.');
}

export async function unfollow(userId: string, sellerId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', userId)
    .eq('seller_id', sellerId);
  if (error) fail(error, 'Désabonnement impossible.');
}

/** Les vendeurs que ce membre suit, du plus récent au plus ancien. */
export async function fetchFollowedSellers(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('seller_id')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false });
  if (error) fail(error, 'Chargement de vos abonnements impossible.');
  return (data as Array<{ seller_id: string }>).map((row) => row.seller_id);
}
