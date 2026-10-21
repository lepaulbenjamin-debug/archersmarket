import { supabase } from '@/services/supabase';

/**
 * Connexion par Google, sur le site.
 *
 * Sur téléphone, Google s'ouvre dans un navigateur intégré qui se referme de
 * lui-même. Sur le site, on est déjà dans le navigateur : la page part chez
 * Google, puis revient sur `/login` avec la session dans l'adresse. Le client
 * Supabase l'y lit à son démarrage (`detectSessionInUrl`), et l'écran de
 * connexion, voyant la session ouverte, reprend l'enchaînement habituel —
 * profil à compléter, ou retour à l'accueil.
 *
 * L'adresse de retour doit figurer dans la liste autorisée du projet Supabase
 * (Authentication → URL Configuration). Sinon, Supabase renvoie vers l'adresse
 * par défaut du projet, et la connexion se perd en route.
 */

export interface OAuthResult {
  cancelled: boolean;
  fullName?: string;
}

/** Voir `AppleSignInButton.web.tsx` : pas de connexion Apple sur le site. */
export async function appleSignInAvailable(): Promise<boolean> {
  return false;
}

export async function signInWithApple(): Promise<OAuthResult> {
  throw new Error('La connexion Apple n’est disponible que dans l’application iPhone.');
}

export async function signInWithGoogle(): Promise<OAuthResult> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/login` },
  });
  if (error) throw new Error(error.message);

  // La page est en train de partir chez Google. Rendre la main maintenant
  // éteindrait l'indicateur d'attente une fraction de seconde avant que la
  // page ne disparaisse : on ne répond jamais, et c'est le départ qui conclut.
  return new Promise<OAuthResult>(() => {});
}
