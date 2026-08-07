import { fail, supabase } from '@/services/supabase';
import type { BlockedMember } from '@/types';

/**
 * Membres bloqués par l'utilisateur. Le blocage est unilatéral côté liste —
 * on ne voit que la sienne — mais ses effets sont symétriques : plus aucun
 * message ne passe et chacun disparaît du fil de l'autre.
 */
export async function fetchBlocked(userId: string): Promise<BlockedMember[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_id, created_at, profiles!blocks_blocked_id_fkey(id, name, handle, avatar_color)')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false });
  if (error) fail(error, 'Chargement des membres bloqués impossible.');

  return ((data ?? []) as unknown as BlockRow[]).map((row) => {
    const profile = one(row.profiles);
    return {
      id: row.blocked_id,
      name: profile?.name ?? 'Membre',
      handle: profile?.handle ?? '',
      avatarColor: profile?.avatar_color ?? '#58585A',
      blockedAt: row.created_at,
    };
  });
}

interface ProfileRow {
  id: string;
  name: string;
  handle: string;
  avatar_color: string;
}

interface BlockRow {
  blocked_id: string;
  created_at: string;
  /** PostgREST renvoie un objet pour une relation vers un seul profil ; les
   *  types générés annoncent un tableau. On accepte les deux formes. */
  profiles?: ProfileRow | ProfileRow[] | null;
}

const one = (value: BlockRow['profiles']): ProfileRow | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

export async function blockMember(userId: string, memberId: string): Promise<void> {
  const { error } = await supabase
    .from('blocks')
    .insert({ blocker_id: userId, blocked_id: memberId });
  // Bloquer deux fois n'est pas une erreur pour qui appuie sur le bouton.
  if (error && error.code !== '23505') fail(error, 'Blocage impossible.');
}

export async function unblockMember(userId: string, memberId: string): Promise<void> {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', userId)
    .eq('blocked_id', memberId);
  if (error) fail(error, 'Déblocage impossible.');
}

/** Identifiants seuls, pour masquer une conversation sans recharger de profils. */
export async function fetchBlockedIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', userId);
  if (error) fail(error, 'Chargement des membres bloqués impossible.');
  return (data ?? []).map((row: { blocked_id: string }) => row.blocked_id);
}
