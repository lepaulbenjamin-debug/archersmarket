import { cacheDirectory, downloadAsync, readAsStringAsync, EncodingType } from 'expo-file-system/legacy';

import { LISTING_PHOTOS_BUCKET, fail, supabase } from '@/services/supabase';

const extensionOf = (uri: string): string => {
  const match = /\.(jpe?g|png|webp|heic)(\?|$)/i.exec(uri);
  return (match?.[1] ?? 'jpg').toLowerCase();
};

const contentTypeOf = (extension: string): string =>
  extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';

/**
 * Rapatrie une photo distante dans le cache pour qu'elle suive le même chemin
 * qu'une photo de la galerie. Retourne null si le téléchargement échoue : une
 * photo manquante ne doit pas empêcher l'import.
 */
export async function cacheRemotePhoto(url: string, index: number): Promise<string | null> {
  if (!cacheDirectory) return null;
  try {
    const target = `${cacheDirectory}import-${Date.now()}-${index}.${extensionOf(url)}`;
    const { uri, status } = await downloadAsync(url, target);
    return status >= 200 && status < 300 ? uri : null;
  } catch {
    return null;
  }
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
  const extension = extensionOf(uri);
  const path = `${userId}/${listingId}/${index}.${extension}`;

  const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

  const { error } = await supabase.storage
    .from(LISTING_PHOTOS_BUCKET)
    .upload(path, bytes, { contentType: contentTypeOf(extension), upsert: true });
  if (error) fail(error, 'Envoi de la photo impossible.');

  return path;
}
