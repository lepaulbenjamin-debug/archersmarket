import type { AnalysisPhoto, PhotoFile } from '@/services/photoFiles';

/**
 * L'accès aux photos, sur le site.
 *
 * Une photo choisie dans le navigateur arrive sous la forme d'une adresse
 * `blob:` ou `data:`, que `fetch` sait lire directement.
 *
 * Elle arrive surtout **telle quelle**. Sur téléphone, le sélecteur compresse
 * selon le réglage de qualité ; dans un navigateur, il l'ignore. Une photo
 * d'appareil de 8 Mo partirait donc entière — refusée par l'analyse, qui
 * plafonne à 6 Mo, et lente à envoyer partout ailleurs. On la réduit ici, à
 * des dimensions où la sérigraphie d'une poignée reste lisible.
 */

const COTE_MAX_ENVOI = 1600;
const COTE_MAX_ANALYSE = 1280;

async function blobOf(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Photo illisible.');
  return response.blob();
}

/**
 * Ramène une image à `coteMax` pixels sur son plus grand côté, en JPEG.
 *
 * Une image déjà plus petite n'est pas agrandie, mais elle est quand même
 * réencodée : c'est ce qui retire les métadonnées de l'appareil — dont la
 * position GPS de la prise de vue, qu'on n'a pas à publier avec l'annonce.
 */
async function shrink(blob: Blob, coteMax: number, qualite: number): Promise<Blob> {
  const image = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const echelle = Math.min(1, coteMax / Math.max(image.width, image.height));
  const largeur = Math.round(image.width * echelle);
  const hauteur = Math.round(image.height * echelle);

  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const contexte = canvas.getContext('2d');
  if (!contexte) throw new Error('Photo illisible par ce navigateur.');
  contexte.drawImage(image, 0, 0, largeur, hauteur);
  image.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (resultat) => (resultat ? resolve(resultat) : reject(new Error('Photo illisible.'))),
      'image/jpeg',
      qualite,
    );
  });
}

export async function readPhoto(uri: string): Promise<PhotoFile> {
  const reduite = await shrink(await blobOf(uri), COTE_MAX_ENVOI, 0.82);
  return { bytes: new Uint8Array(await reduite.arrayBuffer()), extension: 'jpg' };
}

/** La photo telle que l'analyse la veut : réduite, en base64, sans préfixe. */
export async function analysisPhoto(asset: {
  uri: string;
  base64?: string | null;
  mimeType?: string | null;
}): Promise<AnalysisPhoto> {
  const reduite = await shrink(await blobOf(asset.uri), COTE_MAX_ANALYSE, 0.7);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result));
    lecteur.onerror = () => reject(new Error('Photo illisible.'));
    lecteur.readAsDataURL(reduite);
  });
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/jpeg' };
}

/**
 * Récupère une photo distante pour l'import depuis une autre annonce.
 *
 * Le navigateur ne laisse lire une image d'un autre site que si ce site l'y
 * autorise, et la plupart ne le font pas. Dans ce cas la photo est sautée —
 * comme sur téléphone quand un téléchargement échoue — et le reste de l'import
 * se fait quand même : on ajoute alors ses photos à la main.
 */
export async function cacheRemotePhoto(url: string, _index: number): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return URL.createObjectURL(await response.blob());
  } catch {
    return null;
  }
}
