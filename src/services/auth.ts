import { toUser, type ProfileRow } from '@/services/mappers';
import { deleteAllPhotosOf } from '@/services/photos';
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
  'id, handle, name, city, club, bio, discipline, avatar_color, rating, review_count, created_at, accepts_payments, is_moderator';

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

/**
 * Ce que rend une inscription.
 *
 * Quand la confirmation par e-mail est exigée, Supabase crée le compte mais
 * n'ouvre aucune session : il attend le clic sur le lien. Ce n'est pas une
 * erreur, et le traiter comme telle affichait un texte rouge sous le champ
 * e-mail à quelqu'un dont l'inscription venait de réussir — la seule lecture
 * possible étant « ça n'a pas marché ».
 */
export type SignUpResult =
  | { confirme: true; user: User }
  | { confirme: false; email: string };

export async function signUp(input: SignUpInput): Promise<SignUpResult> {
  const email = input.email.trim();
  const { data, error } = await supabase.auth.signUp({
    email,
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
  if (!data.session) return { confirme: false, email };
  return { confirme: true, user: await profileOf(data.user!.id, data.user!.email ?? undefined) };
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

/**
 * Extrait les jetons d'un lien de retour.
 *
 * Le lien reçu par e-mail passe par `/auth/v1/verify`, qui redirige vers
 * `archersmarket://` en plaçant les jetons dans le fragment — après le `#`.
 * Un fragment ne franchit jamais un serveur, ce qui est précisément l'intérêt
 * du procédé, mais implique que personne ne le lit à notre place :
 * `detectSessionInUrl` est une mécanique de navigateur, sans effet ici.
 */
export function tokensFromUrl(url: string): AuthTokens | null {
  const fragment = url.split('#')[1];
  if (!fragment) return null;
  const params = new URLSearchParams(fragment);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  return access_token && refresh_token ? { access_token, refresh_token } : null;
}

/** Ouvre la session portée par un lien de confirmation. */
export async function signInWithTokens(tokens: AuthTokens): Promise<User> {
  const { data, error } = await supabase.auth.setSession(tokens);
  if (error || !data.user) fail(error, 'Ce lien n’est plus valable.');
  return profileOf(data.user.id, data.user.email ?? undefined);
}

/**
 * Renvoie l'e-mail de confirmation.
 *
 * Supabase limite la cadence à un envoi par minute et le dit en anglais, avec
 * le nombre de secondes restantes. On traduit plutôt que de laisser passer :
 * c'est le message que verra le plus souvent quelqu'un qui appuie deux fois.
 */
export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
  if (!error) return;
  const attente = /after (\d+) seconds?/i.exec(error.message);
  if (attente) {
    throw new Error(`Patientez ${attente[1]} secondes avant un nouvel envoi.`);
  }
  fail(error, 'Impossible de renvoyer l’e-mail pour l’instant.');
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Demande un code de réinitialisation. La réponse ne dit jamais si l'adresse
 * existe : le contraire permettrait de dresser la liste des membres.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  // Une adresse inconnue n'est pas une erreur pour l'utilisateur légitime,
  // qui s'est simplement trompé de boîte. Seule une panne réelle remonte.
  if (error && !/user not found|invalid/i.test(error.message)) {
    fail(error, 'Envoi du code impossible. Réessayez dans un instant.');
  }
}

/**
 * Vérifie le code reçu par e-mail puis pose le nouveau mot de passe.
 * Passe par le code reçu par e-mail plutôt que par le lien : un e-mail ouvert
 * sur un ordinateur ne peut pas déclencher l'ouverture de l'app du téléphone.
 */
export async function confirmPasswordReset(
  email: string,
  token: string,
  password: string,
): Promise<User> {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.replace(/\s/g, ''),
    type: 'recovery',
  });
  if (error || !data.user) {
    throw new Error(
      /expired|invalid/i.test(error?.message ?? '')
        ? 'Code incorrect ou expiré. Demandez-en un nouveau.'
        : (error?.message ?? 'Vérification impossible.'),
    );
  }

  const { error: update } = await supabase.auth.updateUser({ password });
  if (update) fail(update, 'Ce mot de passe n’a pas pu être enregistré.');

  return profileOf(data.user.id, data.user.email ?? undefined);
}

/**
 * Efface définitivement le compte et tout ce qui en dépend : annonces, photos,
 * favoris, conversations, messages et avis.
 *
 * Les photos partent d'abord : le bucket ne se vide que par l'API Storage, et
 * une fois le compte effacé plus aucune session n'aurait le droit d'y toucher —
 * les fichiers resteraient accessibles à qui connaît leur adresse. En cas
 * d'échec on s'arrête là, compte intact, plutôt que de laisser des photos
 * orphelines derrière soi.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await deleteAllPhotosOf(userId);

  const { error } = await supabase.rpc('delete_own_account');
  if (error) fail(error, 'Suppression du compte impossible.');
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
