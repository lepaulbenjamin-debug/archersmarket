import { fail, supabase } from '@/services/supabase';

export async function fetchFavorites(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('favorites')
    .select('listing_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) fail(error, 'Chargement des favoris impossible.');
  return (data as Array<{ listing_id: string }>).map((row) => row.listing_id);
}

export async function addFavorite(userId: string, listingId: string): Promise<void> {
  const { error } = await supabase
    .from('favorites')
    .insert({ user_id: userId, listing_id: listingId });
  if (error) fail(error, 'Ajout aux favoris impossible.');
}

export async function removeFavorite(userId: string, listingId: string): Promise<void> {
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('listing_id', listingId);
  if (error) fail(error, 'Retrait des favoris impossible.');
}
