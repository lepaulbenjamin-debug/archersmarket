import { fail, supabase } from '@/services/supabase';

/**
 * Modération.
 *
 * Rien ici n'est un droit : chaque lecture et chaque geste est refusé en base
 * à qui n'est pas modérateur. Cet écran ne fait qu'afficher ce que la base
 * consent à montrer — le cacher dans l'application ne protégerait rien,
 * l'API restant ouverte.
 */

export type RiskKind =
  | 'offsite_payment'
  | 'contact_exchange'
  | 'price_anomaly'
  | 'burst_listing'
  | 'report';

export const riskLabel = (kind: RiskKind): string => {
  switch (kind) {
    case 'offsite_payment':
      return 'Paiement hors plateforme';
    case 'contact_exchange':
      return 'Coordonnées échangées';
    case 'price_anomaly':
      return 'Prix aberrant';
    case 'burst_listing':
      return 'Publication en rafale';
    case 'report':
      return 'Signalé par un membre';
  }
};

export interface FlaggedAccount {
  userId: string;
  name: string;
  handle: string;
  memberSince: string;
  recentSignals: number;
  recentWeight: number;
  lastSignalAt: string | null;
  kinds: RiskKind[];
  reports: number;
}

/** Les comptes portant des signaux récents, du plus lourd au plus léger. */
export async function fetchFlaggedAccounts(): Promise<FlaggedAccount[]> {
  const { data, error } = await supabase
    .from('flagged_accounts')
    .select('user_id, name, handle, member_since, recent_signals, recent_weight, last_signal_at, kinds, reports')
    .order('recent_weight', { ascending: false })
    .limit(100);
  if (error) fail(error, 'File de modération indisponible.');
  return (data ?? []).map((row) => ({
    userId: row.user_id as string,
    name: row.name as string,
    handle: row.handle as string,
    memberSince: row.member_since as string,
    recentSignals: Number(row.recent_signals ?? 0),
    recentWeight: Number(row.recent_weight ?? 0),
    lastSignalAt: (row.last_signal_at as string | null) ?? null,
    kinds: ((row.kinds as RiskKind[] | null) ?? []).filter(Boolean),
    reports: Number(row.reports ?? 0),
  }));
}

export interface RiskSignal {
  id: string;
  kind: RiskKind;
  weight: number;
  detail: string | null;
  messageBody: string | null;
  createdAt: string;
}

/**
 * Le détail d'un compte, message incriminé compris : un motif seul ne suffit
 * pas à décider si quelqu'un fraude ou plaisante.
 */
export async function fetchSignals(userId: string): Promise<RiskSignal[]> {
  const { data, error } = await supabase
    .from('risk_signals')
    .select('id, kind, weight, detail, created_at, messages(body)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) fail(error, 'Signaux indisponibles.');
  return (data ?? []).map((row) => {
    const message = row.messages as { body?: string } | { body?: string }[] | null;
    const body = Array.isArray(message) ? message[0]?.body : message?.body;
    return {
      id: row.id as string,
      kind: row.kind as RiskKind,
      weight: Number(row.weight ?? 0),
      detail: (row.detail as string | null) ?? null,
      messageBody: body ?? null,
      createdAt: row.created_at as string,
    };
  });
}

/**
 * Suspend un compte : ses annonces sortent de la vente, il ne peut plus
 * publier ni écrire. On suspend plutôt qu'on ne supprime — une suppression
 * effacerait aussi les preuves, et serait irréversible le jour où l'on s'est
 * trompé.
 */
export async function suspendAccount(userId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('moderate_suspend', { target: userId, reason });
  if (error) fail(error, 'Suspension impossible.');
}

export async function restoreAccount(userId: string): Promise<void> {
  const { error } = await supabase.rpc('moderate_restore', { target: userId });
  if (error) fail(error, 'Rétablissement impossible.');
}

export interface ModerationReport {
  id: string;
  reason: string;
  details: string | null;
  targetProfileId: string | null;
  targetListingId: string | null;
  createdAt: string;
}

/** Les signalements que des membres ont déposés, et que personne n'a lus. */
export async function fetchPendingReports(): Promise<ModerationReport[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('id, reason, details, profile_id, listing_id, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) fail(error, 'Signalements indisponibles.');
  return (data ?? []).map((row) => ({
    id: row.id as string,
    reason: row.reason as string,
    details: (row.details as string | null) ?? null,
    targetProfileId: (row.profile_id as string | null) ?? null,
    targetListingId: (row.listing_id as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

export async function resolveReport(reportId: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('moderate_resolve_report', { report: reportId, note });
  if (error) fail(error, 'Clôture impossible.');
}
