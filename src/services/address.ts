/**
 * Recherche d'adresse française.
 *
 * On interroge la Base Adresse Nationale, le service public officiel :
 * gratuit, sans clé, et surtout exact. Cela règle le problème le plus coûteux
 * du parcours d'achat — un code postal saisi de travers fait coter le
 * mauvais trajet, et l'étiquette échoue *après* le paiement.
 *
 * Rien de sensible ne transite : une chaîne tapée, et rien d'autre.
 */

const BAN = 'https://api-adresse.data.gouv.fr/search/';

export interface AddressSuggestion {
  /** L'adresse complète, telle qu'on l'affiche. */
  label: string;
  /** La voie seule, à mettre dans le champ « adresse ». */
  street: string;
  zip: string;
  city: string;
  latitude: number;
  longitude: number;
}

interface BanFeature {
  properties?: {
    label?: string;
    name?: string;
    postcode?: string;
    city?: string;
    type?: string;
  };
  geometry?: { coordinates?: [number, number] };
}

/**
 * Propose des adresses à partir de ce qui est tapé.
 *
 * On ne cherche qu'à partir de trois caractères : en deçà, la Base Adresse
 * Nationale rend le pays entier, ce qui n'aide personne et nous fait
 * l'interroger à chaque lettre.
 */
export async function suggestAddresses(
  query: string,
  signal?: AbortSignal,
  /**
   * `municipality` ne rend que des communes. Pour un trajet, une voie précise
   * n'apporte rien et encombre : on part d'une ville, on va dans une autre.
   */
  type?: 'municipality',
): Promise<AddressSuggestion[]> {
  const texte = query.trim();
  if (texte.length < 3) return [];

  const url =
    `${BAN}?q=${encodeURIComponent(texte)}&limit=5&autocomplete=1` +
    (type ? `&type=${type}` : '');
  const response = await fetch(url, { signal });
  if (!response.ok) return [];

  const payload = (await response.json()) as { features?: BanFeature[] };
  return (payload.features ?? [])
    .map((feature) => {
      const p = feature.properties ?? {};
      const [longitude, latitude] = feature.geometry?.coordinates ?? [0, 0];
      return {
        label: p.label ?? '',
        // `name` porte la voie avec son numéro ; sur une commune sans numéro
        // il vaut le nom de la rue, ce qui reste juste.
        street: p.name ?? '',
        zip: p.postcode ?? '',
        city: p.city ?? '',
        latitude,
        longitude,
      };
    })
    .filter((suggestion) => suggestion.label && suggestion.zip && suggestion.city);
}
