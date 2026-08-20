import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/services/supabase';

/**
 * Connexion par Apple et par Google.
 *
 * Deux mécanismes différents, choisis pour de bonnes raisons :
 *
 * Apple passe par le bouton natif du système. C'est ce qu'Apple attend, et
 * l'utilisateur n'ouvre aucun navigateur — Face ID suffit. Le jeton d'identité
 * qu'il renvoie est vérifié par Supabase.
 *
 * Google passe par un navigateur intégré. Le faire en natif imposerait un
 * module supplémentaire et une configuration Google Cloud plus lourde, pour un
 * gain d'une seconde. La session se referme d'elle-même au retour.
 */

export const REDIRECT = 'archersmarket://auth';

/** Apple n'existe que sur iOS, et pas sur les appareils trop anciens. */
export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export interface OAuthResult {
  /** L'utilisateur a fermé la feuille sans aller au bout : ce n'est pas une erreur. */
  cancelled: boolean;
  /** Nom transmis par le fournisseur, à retenir : Apple ne le donne qu'une fois. */
  fullName?: string;
}

export async function signInWithApple(): Promise<OAuthResult> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return { cancelled: true };
    throw error;
  }

  if (!credential.identityToken) {
    throw new Error('Apple n’a pas fourni de jeton d’identité.');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw new Error(error.message);

  // Apple ne transmet nom et prénom qu'à la toute première connexion. Si on
  // ne les capte pas maintenant, ils sont perdus définitivement.
  const nom = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();

  return { cancelled: false, fullName: nom || undefined };
}

export async function signInWithGoogle(): Promise<OAuthResult> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error('Google n’a pas renvoyé d’adresse de connexion.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT);
  if (result.type !== 'success') return { cancelled: true };

  return { cancelled: false, ...(await sessionFromUrl(result.url)) };
}

/**
 * Ouvre la session à partir de l'adresse de retour.
 *
 * Supabase renvoie soit un code à échanger, soit les jetons directement dans
 * le fragment. On accepte les deux : la forme dépend du réglage du projet, et
 * se tromper laisserait l'utilisateur sur un écran de connexion après avoir
 * pourtant validé chez Google.
 */
async function sessionFromUrl(url: string): Promise<{ fullName?: string }> {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.hash.replace(/^#/, '') || parsed.search);

  const erreur = params.get('error_description') ?? params.get('error');
  if (erreur) throw new Error(decodeURIComponent(erreur));

  const code = params.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw new Error(error.message);
    return { fullName: nameFrom(data.session?.user?.user_metadata) };
  }

  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) {
    throw new Error('Connexion incomplète : aucun jeton reçu.');
  }
  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw new Error(error.message);
  return { fullName: nameFrom(data.session?.user?.user_metadata) };
}

const nameFrom = (metadata?: Record<string, unknown>): string | undefined => {
  const nom = (metadata?.full_name ?? metadata?.name) as string | undefined;
  return nom?.trim() || undefined;
};
