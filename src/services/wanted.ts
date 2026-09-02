import { fail, supabase } from '@/services/supabase';
import { toListing, type ListingRow } from '@/services/mappers';
import type { CategoryId, Handedness, Listing } from '@/types';

/**
 * Les recherches : dire ce qu'on cherche, au lieu d'attendre que ça paraisse.
 *
 * À ne pas confondre avec les alertes (`savedSearches`), qui font l'inverse :
 * un filtre privé qui dort jusqu'à ce qu'une annonce y réponde. Ici la demande
 * est publique, écrite pour être lue par des humains, et ce sont les
 * volontaires qui sont prévenus.
 *
 * Rien n'est envoyé depuis ce fichier. Les notifications partent de
 * déclencheurs, en base, pour sonner même quand personne n'a l'application
 * ouverte — et la limite de trois recherches ouvertes est tenue par la
 * politique de sécurité, pas par les écrans : c'est le seul endroit qu'on ne
 * contourne pas en appelant l'API directement.
 */

export type WantedStatus = 'open' | 'found' | 'closed';

export interface WantedRequest {
  id: string;
  seekerId: string;
  seekerName: string;
  seekerHandle: string;
  seekerCity: string | null;
  seekerColor: string | null;
  title: string;
  detail?: string;
  category: CategoryId;
  brands?: string[];
  handedness?: Handedness;
  minDrawWeight?: number;
  maxDrawWeight?: number;
  maxPrice?: number;
  status: WantedStatus;
  expiresAt: string;
  createdAt: string;
}

export interface NewWantedInput {
  title: string;
  detail?: string;
  category: CategoryId;
  brands?: string[];
  handedness?: Handedness;
  minDrawWeight?: number;
  maxDrawWeight?: number;
  maxPrice?: number;
}

interface WantedRow {
  id: string;
  seeker_id: string;
  seeker_name: string;
  seeker_handle: string;
  seeker_city: string | null;
  seeker_color: string | null;
  title: string;
  detail: string | null;
  category: CategoryId;
  brands: string[] | null;
  handedness: Handedness | null;
  min_draw_weight: number | string | null;
  max_draw_weight: number | string | null;
  max_price: number | string | null;
  status: WantedStatus;
  expires_at: string;
  created_at: string;
}

const nombre = (value: number | string | null): number | undefined => {
  if (value === null) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const vide = <T,>(liste: T[] | null): T[] | undefined =>
  liste && liste.length ? liste : undefined;

const toWanted = (row: WantedRow): WantedRequest => ({
  id: row.id,
  seekerId: row.seeker_id,
  seekerName: row.seeker_name,
  seekerHandle: row.seeker_handle,
  seekerCity: row.seeker_city,
  seekerColor: row.seeker_color,
  title: row.title,
  detail: row.detail ?? undefined,
  category: row.category,
  brands: vide(row.brands),
  handedness: row.handedness ?? undefined,
  minDrawWeight: nombre(row.min_draw_weight),
  maxDrawWeight: nombre(row.max_draw_weight),
  maxPrice: nombre(row.max_price),
  status: row.status,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
});

// Un seul littéral, et non une concaténation : supabase-js déduit le type des
// lignes rendues à partir de cette chaîne, et une expression calculée lui fait
// perdre le fil — le résultat retombe alors sur un type d'erreur générique.
const SELECT =
  'id, seeker_id, seeker_name, seeker_handle, seeker_city, seeker_color, title, detail, category, brands, handedness, min_draw_weight, max_draw_weight, max_price, status, expires_at, created_at';

/** Le fil : ce que les autres cherchent, le plus récent d'abord. */
export async function fetchWanted(category?: CategoryId): Promise<WantedRequest[]> {
  let requete = supabase
    .from('wanted_feed')
    .select(SELECT)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(60);
  if (category) requete = requete.eq('category', category);

  const { data, error } = await requete;
  if (error) fail(error, 'Impossible de charger les recherches.');
  return (data as WantedRow[]).map(toWanted);
}

/** Les miennes, ouvertes ou non : c'est ici qu'on les referme. */
export async function fetchMyWanted(userId: string): Promise<WantedRequest[]> {
  const { data, error } = await supabase
    .from('wanted_feed')
    .select(SELECT)
    .eq('seeker_id', userId)
    .order('created_at', { ascending: false });
  if (error) fail(error, 'Impossible de charger vos recherches.');
  return (data as WantedRow[]).map(toWanted);
}

export async function fetchWantedById(id: string): Promise<WantedRequest | null> {
  const { data, error } = await supabase
    .from('wanted_feed')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) fail(error, 'Recherche introuvable.');
  return data ? toWanted(data as WantedRow) : null;
}

/**
 * Publie une recherche.
 *
 * Le refus le plus probable est la limite de trois : la politique le renvoie
 * en violation de sécurité au niveau ligne, message que personne ne devrait
 * lire. On le traduit ici, en disant ce qu'il faut faire pour s'en sortir.
 */
export async function createWanted(input: NewWantedInput, userId: string): Promise<WantedRequest> {
  const { data, error } = await supabase
    .from('wanted_requests')
    .insert({
      seeker_id: userId,
      title: input.title.trim(),
      detail: input.detail?.trim() || null,
      category: input.category,
      brands: input.brands?.length ? input.brands : null,
      handedness: input.handedness ?? null,
      min_draw_weight: input.minDrawWeight ?? null,
      max_draw_weight: input.maxDrawWeight ?? null,
      max_price: input.maxPrice ?? null,
    })
    .select('id')
    .single();

  if (error) {
    if (/row-level security/i.test(error.message)) {
      throw new Error(
        'Vous avez déjà trois recherches en cours. Fermez-en une avant d’en ouvrir une autre.',
      );
    }
    fail(error, 'Publication de la recherche impossible.');
  }

  const publiee = await fetchWantedById((data as { id: string }).id);
  if (!publiee) fail(null, 'Recherche publiée mais introuvable.');
  return publiee;
}

/** Trouvé, ou abandonné : dans les deux cas elle quitte le fil. */
export async function closeWanted(id: string, status: 'found' | 'closed'): Promise<void> {
  const { error } = await supabase
    .from('wanted_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) fail(error, 'Cette recherche n’a pas pu être fermée.');
}

/** Repartir pour trente jours. */
export async function renewWanted(id: string): Promise<void> {
  const dans30jours = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const { error } = await supabase
    .from('wanted_requests')
    .update({ status: 'open', expires_at: dans30jours, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) fail(error, 'Cette recherche n’a pas pu être relancée.');
}

export async function deleteWanted(id: string): Promise<void> {
  const { error } = await supabase.from('wanted_requests').delete().eq('id', id);
  if (error) fail(error, 'Suppression impossible.');
}

/**
 * Les annonces qui répondent déjà à une recherche.
 *
 * Le moment de plus forte valeur est celui où la recherche vient d'être
 * écrite : s'il existe déjà trois annonces qui conviennent, il faut le dire
 * là, et non attendre qu'une quatrième paraisse.
 */
export async function wantedMatches(id: string): Promise<Listing[]> {
  const { data, error } = await supabase.rpc('wanted_matches', { wanted_id: id });
  if (error) fail(error, 'Impossible de chercher les annonces correspondantes.');
  return (data as ListingRow[]).map(toListing);
}

// ---------------------------------------------------------------------------
// Être prévenu de ce que les autres cherchent
// ---------------------------------------------------------------------------

export interface WatchPreference {
  /** Vide : toutes les catégories. */
  categories: CategoryId[];
}

/** `null` quand le membre ne s'est pas porté volontaire. */
export async function fetchWatch(userId: string): Promise<WatchPreference | null> {
  const { data, error } = await supabase
    .from('wanted_watchers')
    .select('categories')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) fail(error, 'Impossible de lire vos préférences.');
  return data ? { categories: (data as { categories: CategoryId[] }).categories } : null;
}

export async function setWatch(userId: string, categories: CategoryId[]): Promise<void> {
  const { error } = await supabase
    .from('wanted_watchers')
    .upsert({ user_id: userId, categories }, { onConflict: 'user_id' });
  if (error) fail(error, 'Vos préférences n’ont pas pu être enregistrées.');
}

export async function stopWatching(userId: string): Promise<void> {
  const { error } = await supabase.from('wanted_watchers').delete().eq('user_id', userId);
  if (error) fail(error, 'Impossible d’arrêter les notifications.');
}
