import { fail, supabase } from '@/services/supabase';
import { categoryById } from '@/data/catalog';
import type { CategoryId, ConditionId, Handedness, ListingFilters } from '@/types';

/**
 * Alertes sur recherche.
 *
 * On enregistre les critères tels que l'écran de recherche les manipule, pas
 * un texte libre : c'est ce qui permet à la base de savoir, au moment où une
 * annonce est publiée, si elle correspond — sans rejouer la recherche de
 * chaque membre.
 *
 * L'envoi ne passe pas par ici. Il part d'un déclencheur, à la publication,
 * pour que l'alerte sonne même quand personne n'a l'application ouverte.
 */

export interface SavedSearch {
  id: string;
  label: string;
  filters: ListingFilters;
  notify: boolean;
  createdAt: string;
  lastNotifiedAt?: string;
}

interface SavedSearchRow {
  id: string;
  label: string;
  query: string | null;
  categories: CategoryId[] | null;
  conditions: ConditionId[] | null;
  brands: string[] | null;
  handedness: Handedness | null;
  min_price: number | string | null;
  max_price: number | string | null;
  min_draw_weight: number | string | null;
  max_draw_weight: number | string | null;
  shipping_only: boolean;
  notify: boolean;
  created_at: string;
  last_notified_at: string | null;
}

const nombre = (value: number | string | null): number | undefined => {
  if (value === null) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const vide = <T,>(liste: T[] | null | undefined): T[] | undefined =>
  liste && liste.length ? liste : undefined;

const toSavedSearch = (row: SavedSearchRow): SavedSearch => ({
  id: row.id,
  label: row.label,
  notify: row.notify,
  createdAt: row.created_at,
  lastNotifiedAt: row.last_notified_at ?? undefined,
  filters: {
    query: row.query ?? undefined,
    categories: vide(row.categories),
    conditions: vide(row.conditions),
    brands: vide(row.brands),
    handedness: row.handedness ?? undefined,
    minPrice: nombre(row.min_price),
    maxPrice: nombre(row.max_price),
    minDrawWeight: nombre(row.min_draw_weight),
    maxDrawWeight: nombre(row.max_draw_weight),
    shippingOnly: row.shipping_only || undefined,
  },
});

const SELECT =
  'id, label, query, categories, conditions, brands, handedness, min_price, max_price, min_draw_weight, max_draw_weight, shipping_only, notify, created_at, last_notified_at';

export async function fetchSavedSearches(): Promise<SavedSearch[]> {
  const { data, error } = await supabase
    .from('saved_searches')
    .select(SELECT)
    .order('created_at', { ascending: false });
  if (error) fail(error, 'Alertes indisponibles.');
  return (data as SavedSearchRow[]).map(toSavedSearch);
}

/**
 * Un nom lisible tiré des critères.
 *
 * « Poignée Hoyt » vaut mieux que « Recherche du 9 août » : c'est ce nom qui
 * s'affichera en titre de la notification, des mois plus tard, quand le
 * membre aura oublié ce qu'il cherchait.
 */
export function describeFilters(filters: ListingFilters): string {
  const morceaux: string[] = [];
  if (filters.query?.trim()) morceaux.push(filters.query.trim());
  if (filters.categories?.length === 1) morceaux.push(categoryById(filters.categories[0]).label);
  else if (filters.categories?.length) morceaux.push(`${filters.categories.length} catégories`);
  if (filters.brands?.length === 1) morceaux.push(filters.brands[0]);
  else if (filters.brands?.length) morceaux.push(`${filters.brands.length} marques`);
  if (filters.handedness && filters.handedness !== 'na') {
    morceaux.push(filters.handedness === 'left' ? 'gaucher' : 'droitier');
  }
  if (filters.maxPrice) morceaux.push(`jusqu’à ${filters.maxPrice} €`);
  else if (filters.minPrice) morceaux.push(`à partir de ${filters.minPrice} €`);

  return morceaux.length ? morceaux.join(' · ').slice(0, 60) : 'Toutes les nouveautés';
}

/** Une recherche sans aucun critère alerterait sur tout le marché. */
export const hasCriteria = (filters: ListingFilters): boolean =>
  Boolean(
    filters.query?.trim() ||
      filters.categories?.length ||
      filters.conditions?.length ||
      filters.brands?.length ||
      (filters.handedness && filters.handedness !== 'na') ||
      filters.minPrice ||
      filters.maxPrice ||
      filters.minDrawWeight ||
      filters.maxDrawWeight ||
      filters.shippingOnly,
  );

export async function createSavedSearch(
  filters: ListingFilters,
  label?: string,
): Promise<SavedSearch> {
  const { data: session } = await supabase.auth.getUser();
  const userId = session.user?.id;
  if (!userId) fail(null, 'Connexion requise.');

  const { data, error } = await supabase
    .from('saved_searches')
    .insert({
      user_id: userId,
      label: (label?.trim() || describeFilters(filters)).slice(0, 60),
      query: filters.query?.trim() || null,
      categories: filters.categories ?? null,
      conditions: filters.conditions ?? null,
      brands: filters.brands ?? null,
      handedness: filters.handedness ?? null,
      min_price: filters.minPrice ?? null,
      max_price: filters.maxPrice ?? null,
      min_draw_weight: filters.minDrawWeight ?? null,
      max_draw_weight: filters.maxDrawWeight ?? null,
      shipping_only: !!filters.shippingOnly,
    })
    .select(SELECT)
    .single();

  if (error) {
    // La base refuse deux alertes identiques : dix fois les mêmes critères
    // enverraient dix notifications pour la même annonce.
    if (error.code === '23505') fail(error, 'Vous avez déjà cette alerte.');
    fail(error, 'Création de l’alerte impossible.');
  }
  return toSavedSearch(data as SavedSearchRow);
}

export async function setSavedSearchNotify(id: string, notify: boolean): Promise<void> {
  const { error } = await supabase.from('saved_searches').update({ notify }).eq('id', id);
  if (error) fail(error, 'Mise à jour de l’alerte impossible.');
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const { error } = await supabase.from('saved_searches').delete().eq('id', id);
  if (error) fail(error, 'Suppression de l’alerte impossible.');
}
