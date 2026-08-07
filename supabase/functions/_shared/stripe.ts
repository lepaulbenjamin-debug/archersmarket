/**
 * Accès à Stripe depuis les fonctions Edge.
 *
 * Pas de bibliothèque : l'API Stripe parle en formulaire encodé, et un
 * `fetch` suffit. Une dépendance de moins à suivre sur un chemin où circule
 * de l'argent.
 */

const STRIPE_API = 'https://api.stripe.com/v1';

export const stripeKey = (): string => {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY absente de la configuration.');
  return key;
};

/** Aplatit un objet en paires clé/valeur à la manière de Stripe : a[b][c]=1. */
function formEncode(value: unknown, prefix = ''): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => formEncode(item, `${prefix}[${index}]`));
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) =>
      formEncode(inner, prefix ? `${prefix}[${key}]` : key),
    );
  }
  return [`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`];
}

export interface StripeOptions {
  /** Rejoue sans risque de doublon : indispensable sur un virement. */
  idempotencyKey?: string;
  /** Agit au nom d'un compte connecté. */
  stripeAccount?: string;
}

export async function stripeRequest<T = Record<string, unknown>>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
  options: StripeOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeKey()}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  if (options.stripeAccount) headers['Stripe-Account'] = options.stripeAccount;

  const encoded = body ? formEncode(body).join('&') : undefined;
  const response = await fetch(
    method === 'GET' && encoded ? `${STRIPE_API}${path}?${encoded}` : `${STRIPE_API}${path}`,
    { method, headers, body: method === 'POST' ? encoded : undefined },
  );

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message ?? `Stripe a répondu ${response.status}.`;
    throw new Error(message);
  }
  return payload as T;
}

/**
 * L'API v2, en JSON.
 *
 * Stripe refuse désormais /v1/accounts à toute nouvelle plateforme : la
 * création de comptes connectés passe obligatoirement par /v2/core/accounts,
 * qui exige une version d'API explicite. Elle est épinglée ici — une version
 * qui bouge sous les pieds d'un système de paiement, c'est une panne un matin
 * sans prévenir.
 */
export const STRIPE_V2_VERSION = '2025-11-17.preview';

export async function stripeV2Request<T = Record<string, unknown>>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
  options: StripeOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeKey()}`,
    'Content-Type': 'application/json',
    'Stripe-Version': STRIPE_V2_VERSION,
  };
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  const response = await fetch(`https://api.stripe.com/v2${path}`, {
    method,
    headers,
    body: method === 'POST' && body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json();
  if (!response.ok) {
    // La v2 détaille ses refus champ par champ : ce message-là est utile,
    // celui du niveau supérieur ne l'est pas.
    const invalid = payload?.error?.invalid_fields?.[0]?.message;
    throw new Error(invalid ?? payload?.error?.message ?? `Stripe a répondu ${response.status}.`);
  }
  return payload as T;
}

/**
 * Vérifie la signature d'un événement Stripe.
 *
 * Sans cette vérification, n'importe qui pourrait annoncer un paiement reçu
 * en appelant l'adresse du webhook.
 */
export async function verifyWebhook(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key, rest.join('=')];
    }),
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Rejeu : un événement capté hier ne doit pas pouvoir être renvoyé.
  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const expected = Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqual(expected, signature);
}

/** Comparaison à durée constante : une comparaison naïve fuit la signature. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
