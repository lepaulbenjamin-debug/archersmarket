import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    'Configuration Supabase manquante : renseignez EXPO_PUBLIC_SUPABASE_URL et ' +
      'EXPO_PUBLIC_SUPABASE_KEY dans .env (voir .env.example).',
  );
}

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Sans délai maximum, une requête coupée en cours de route (réseau mobile
 * instable) laisse l'écran en chargement indéfiniment.
 */
const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  init?.signal?.addEventListener('abort', () => controller.abort());
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
};

export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Pas de redirection OAuth par URL sur mobile.
    detectSessionInUrl: false,
  },
  global: { fetch: fetchWithTimeout },
});

export const LISTING_PHOTOS_BUCKET = 'listing-photos';

const NETWORK_HINTS = ['fetch', 'abort', 'network', 'timeout'];

/** Remonte un message lisible plutôt que l'objet d'erreur brut de PostgREST. */
export function fail(error: { message: string; code?: string } | null, fallback: string): never {
  const detail = error?.message ?? '';
  if (NETWORK_HINTS.some((hint) => detail.toLowerCase().includes(hint))) {
    throw new Error('Serveur injoignable. Vérifiez votre connexion et réessayez.');
  }
  throw new Error(detail ? `${fallback} (${detail})` : fallback);
}

/**
 * Une fonction Edge en erreur place son message dans le corps de la réponse.
 * Sans cette lecture, « aucun transporteur ne dessert cette adresse » se
 * réduirait à « une erreur est survenue ».
 */
export async function edgeBody(error: unknown): Promise<Record<string, any> | null> {
  try {
    return await (error as { context?: Response })?.context?.clone().json();
  } catch {
    return null;
  }
}
