import { cacheDirectory, downloadAsync, EncodingType, readAsStringAsync } from 'expo-file-system/legacy';

/**
 * L'accès aux fichiers photo, sur téléphone.
 *
 * Isolé dans ce module parce que c'est la seule partie de l'envoi de photos
 * qui dépend du système : sur le site, une photo choisie n'est pas un fichier
 * sur disque mais un objet du navigateur, et se lit autrement
 * (`photoFiles.web.ts`).
 */

const extensionOf = (uri: string): string => {
  const match = /\.(jpe?g|png|webp|heic)(\?|$)/i.exec(uri);
  return (match?.[1] ?? 'jpg').toLowerCase();
};

export interface PhotoFile {
  bytes: Uint8Array;
  /** Sans le point : `jpg`, `png`, `webp`. */
  extension: string;
}

/** Les octets d'une photo locale, prêts à envoyer au stockage. */
export async function readPhoto(uri: string): Promise<PhotoFile> {
  const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  return {
    bytes: Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)),
    extension: extensionOf(uri),
  };
}

export interface AnalysisPhoto {
  base64: string;
  mimeType: string;
}

/**
 * La photo telle que l'analyse la veut. Sur téléphone, le sélecteur l'a déjà
 * compressée et encodée : on la reprend telle quelle.
 */
export async function analysisPhoto(asset: {
  uri: string;
  base64?: string | null;
  mimeType?: string | null;
}): Promise<AnalysisPhoto> {
  if (!asset.base64) throw new Error('Photo illisible.');
  return { base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' };
}

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
