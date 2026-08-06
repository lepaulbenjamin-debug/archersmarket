import { toUser, type ProfileRow } from '@/services/mappers';
import { fail, supabase } from '@/services/supabase';
import type { User } from '@/types';

export interface Credentials {
  email: string;
  password: string;
}

export interface SignUpInput extends Credentials {
  name: string;
  city: string;
  club?: string;
}

const PROFILE_SELECT =
  'id, handle, name, city, club, bio, discipline, avatar_color, rating, review_count, created_at';

const handleFrom = (name: string) =>
  name.trim().toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').slice(0, 18) || 'archer';

async function profileOf(userId: string, email?: string): Promise<User> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .single();
  if (error || !data) fail(error, 'Profil introuvable.');
  return toUser(data as ProfileRow, email);
}

export async function restoreSession(): Promise<User | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;
  try {
    return await profileOf(session.user.id, session.user.email ?? undefined);
  } catch {
    // Session valide mais profil absent (compte supprimé côté base).
    await supabase.auth.signOut();
    return null;
  }
}

export async function signIn({ email, password }: Credentials): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) {
    throw new Error(
      error.message === 'Invalid login credentials'
        ? 'Adresse e-mail ou mot de passe incorrect.'
        : error.message,
    );
  }
  return profileOf(data.user.id, data.user.email ?? undefined);
}

export async function signUp(input: SignUpInput): Promise<User> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      // Reprises par le trigger handle_new_user pour créer le profil.
      data: {
        name: input.name.trim(),
        handle: handleFrom(input.name),
        city: input.city.trim(),
        club: input.club?.trim() ?? '',
      },
    },
  });
  if (error) {
    throw new Error(
      error.message.includes('already registered')
        ? 'Un compte existe déjà avec cette adresse e-mail.'
        : error.message,
    );
  }
  if (!data.session) {
    throw new Error(
      'Compte créé. Confirmez votre adresse e-mail via le lien reçu, puis connectez-vous.',
    );
  }
  return profileOf(data.user!.id, data.user!.email ?? undefined);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function updateProfile(userId: string, patch: Partial<User>): Promise<User> {
  const { error } = await supabase
    .from('profiles')
    .update({
      name: patch.name,
      city: patch.city,
      club: patch.club ?? null,
      bio: patch.bio ?? null,
      discipline: patch.discipline ?? null,
    })
    .eq('id', userId);
  if (error) fail(error, 'Mise à jour du profil impossible.');
  return profileOf(userId, patch.email);
}

export async function getUser(userId: string): Promise<User | null> {
  try {
    return await profileOf(userId);
  } catch {
    return null;
  }
}

/**
 * Profils connus, pour afficher les vendeurs et les interlocuteurs.
 * Plafonné : à volume important, il faudra charger à la demande par identifiant.
 */
export async function getUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) fail(error, 'Chargement des profils impossible.');
  return (data as ProfileRow[]).map((row) => toUser(row));
}
