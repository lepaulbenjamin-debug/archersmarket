/**
 * Inscription d'un vendeur au paiement sécurisé.
 *
 * Crée son compte Stripe Connect s'il n'en a pas, puis renvoie le lien vers
 * le formulaire d'identité hébergé par Stripe. Nous ne voyons jamais ses
 * pièces justificatives ni son IBAN : ils vont directement chez Stripe.
 */
import { CORS, callerId, json, serviceClient } from '../_shared/context.ts';
import { stripeRequest } from '../_shared/stripe.ts';

const RETOUR = 'archersmarket://compte/paiement';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const userId = await callerId(request);
    if (!userId) return json({ error: 'Connexion requise.' }, 401);

    const db = serviceClient();
    const { data: existing } = await db
      .from('seller_accounts')
      .select('stripe_account_id')
      .eq('user_id', userId)
      .maybeSingle();

    let accountId = existing?.stripe_account_id as string | undefined;

    if (!accountId) {
      const { data: profile } = await db
        .from('profiles')
        .select('city')
        .eq('id', userId)
        .maybeSingle();

      const account = await stripeRequest<{ id: string }>('POST', '/accounts', {
        type: 'express',
        country: 'FR',
        business_type: 'individual',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          product_description: 'Vente de matériel de tir à l’arc d’occasion entre particuliers',
          mcc: '5941',
        },
        metadata: { archers_market_user: userId, ville: profile?.city ?? '' },
      // Un compte créé deux fois, c'est un vendeur qui ne sait plus lequel
      // recevra son argent.
      }, { idempotencyKey: `account:${userId}` });

      accountId = account.id;
      await db.from('seller_accounts').insert({ user_id: userId, stripe_account_id: accountId });
    }

    // Le lien expire vite et ne sert qu'une fois : on en refait un à chaque
    // passage plutôt que d'en conserver un périmé.
    const link = await stripeRequest<{ url: string }>('POST', '/account_links', {
      account: accountId,
      type: 'account_onboarding',
      refresh_url: RETOUR,
      return_url: RETOUR,
    });

    return json({ url: link.url });
  } catch (error) {
    console.error('stripe-connect', error);
    return json({ error: (error as Error).message }, 400);
  }
});
