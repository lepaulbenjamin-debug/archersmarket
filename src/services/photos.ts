import { readPhoto } from '@/services/photoFiles';
import { LISTING_PHOTOS_BUCKET, fail, supabase } from '@/services/supabase';

// La lecture des fichiers dépend du système : téléphone ou navigateur.
export { cacheRemotePhoto } from '@/services/photoFiles';

const contentTypeOf = (extension: string): string =>
  extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';

/**
 * Retire du bucket toutes les photos d'un membre. Passe par l'API Storage :
 * Supabase interdit d'effacer ces fichiers en SQL, y compris depuis une
 * fonction privilégiée. La règle d'accès limite chacun à son propre dossier.
 */
export async function deleteAllPhotosOf(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('listing_images')
    .select('path, listings!inner(seller_id)')
    .eq('listings.seller_id', userId);
  if (error) fail(error, 'Suppression des photos impossible.');

  const paths = (data ?? []).map((row: { path: string }) => row.path);
  if (paths.length === 0) return;

  const { error: removal } = await supabase.storage.from(LISTING_PHOTOS_BUCKET).remove(paths);
  if (removal) fail(removal, 'Suppression des photos impossible.');
}

/**
 * Envoie une photo locale dans le bucket des annonces et retourne son chemin.
 * Le premier segment du chemin est l'identifiant du vendeur : c'est lui qui
 * autorise l'écriture côté Storage.
 */
export async function uploadListingPhoto(
  uri: string,
  userId: string,
  listingId: string,
  index: number,
): Promise<string> {
  const { bytes, extension } = await readPhoto(uri);
  const path = `${userId}/${listingId}/${index}.${extension}`;

  const { error } = await supabase.storage
    .from(LISTING_PHOTOS_BUCKET)
    .upload(path, bytes, { contentType: contentTypeOf(extension), upsert: true });
  if (error) fail(error, 'Envoi de la photo impossible.');

  return path;
}
