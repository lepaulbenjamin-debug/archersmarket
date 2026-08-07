/**
 * Ce que partagent les fonctions de paiement : identifier l'appelant, écrire
 * en base avec les pleins droits, et répondre.
 */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** Client de service : contourne les règles d'accès, à n'utiliser qu'ici. */
export const serviceClient = (): SupabaseClient =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

/**
 * Identifie le membre à l'origine de l'appel à partir de son jeton.
 * Retourne null si le jeton manque ou ne vaut rien : aucune fonction ne doit
 * deviner l'identité de son appelant.
 */
export async function callerId(request: Request): Promise<string | null> {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.getUser(header.slice(7));
  return error ? null : (data.user?.id ?? null);
}

/**
 * Réservé aux appels internes : la clé de service, jamais embarquée dans
 * l'application. Comparaison à durée constante — une comparaison naïve laisse
 * deviner la clé caractère par caractère.
 */
export function isScheduler(request: Request): boolean {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expected = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!expected || token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
