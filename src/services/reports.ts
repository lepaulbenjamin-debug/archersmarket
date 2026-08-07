import { fail, supabase } from '@/services/supabase';
import type { ReportReason } from '@/types';

interface ReportInput {
  reporterId: string;
  reason: ReportReason;
  details?: string;
  /** Une cible et une seule. */
  listingId?: string;
  profileId?: string;
}

export async function createReport(input: ReportInput): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: input.reporterId,
    target: input.listingId ? 'listing' : 'profile',
    listing_id: input.listingId ?? null,
    profile_id: input.profileId ?? null,
    reason: input.reason,
    details: input.details?.trim() || null,
  });
  if (error) {
    if (error.code === '23505') throw new Error('Vous avez déjà signalé cet élément.');
    if (error.code === '42501') {
      throw new Error('Vous ne pouvez pas signaler votre propre annonce.');
    }
    fail(error, 'Envoi du signalement impossible.');
  }
}

/** Cibles déjà signalées par l'utilisateur, pour éviter un doublon inutile. */
export async function fetchReportedTargets(
  userId: string,
): Promise<{ listings: string[]; profiles: string[] }> {
  const { data, error } = await supabase
    .from('reports')
    .select('listing_id, profile_id')
    .eq('reporter_id', userId);
  if (error) fail(error, 'Chargement des signalements impossible.');

  const rows = data as Array<{ listing_id: string | null; profile_id: string | null }>;
  return {
    listings: rows.map((r) => r.listing_id).filter((id): id is string => !!id),
    profiles: rows.map((r) => r.profile_id).filter((id): id is string => !!id),
  };
}
