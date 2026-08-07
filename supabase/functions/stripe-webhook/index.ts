/**
 * Ce que Stripe vient nous dire.
 *
 * Seule source de vérité pour « le paiement est passé » : la réponse reçue
 * par le téléphone ne prouve rien, elle peut se perdre ou être fabriquée.
 *
 * Cette fonction est ouverte sans jeton Supabase — Stripe n'en a pas. C'est
 * la signature de l'événement qui l'authentifie, et rien d'autre.
 */
import { json, serviceClient } from '../_shared/context.ts';
import { verifyWebhook } from '../_shared/stripe.ts';

Deno.serve(async (request) => {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'Webhook non configuré.' }, 500);

  const payload = await request.text();
  const valid = await verifyWebhook(payload, request.headers.get('stripe-signature'), secret);
  if (!valid) return json({ error: 'Signature invalide.' }, 400);

  const event = JSON.parse(payload);
  const db = serviceClient();

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        // La condition sur l'état rend le rejeu inoffensif : Stripe renvoie
        // volontiers deux fois le même événement.
        await db
          .from('orders')
          .update({
            status: 'paid',
            // Le virement au vendeur s'y rattachera : sans cette référence, il
            // faudrait attendre le règlement bancaire pour pouvoir le lancer.
            stripe_charge_id: intent.latest_charge ?? null,
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_payment_intent_id', intent.id)
          .eq('status', 'pending');

        // L'annonce sort du fil : elle est vendue, pas seulement réservée.
        if (intent.metadata?.listing_id) {
          await db
            .from('listings')
            .update({ status: 'reserved' })
            .eq('id', intent.metadata.listing_id)
            .eq('status', 'active');
        }
        break;
      }

      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled': {
        await db
          .from('orders')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('stripe_payment_intent_id', event.data.object.id)
          .eq('status', 'pending');
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        if (charge.payment_intent) {
          await db
            .from('orders')
            .update({
              status: 'refunded',
              refunded_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_payment_intent_id', charge.payment_intent);
        }
        break;
      }

      case 'account.updated': {
        const account = event.data.object;
        await db
          .from('seller_accounts')
          .update({
            charges_enabled: !!account.charges_enabled,
            payouts_enabled: !!account.payouts_enabled,
            details_submitted: !!account.details_submitted,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_account_id', account.id);
        break;
      }

      default:
        // Les autres événements ne nous concernent pas ; répondre 200 évite
        // que Stripe les réessaie indéfiniment.
        break;
    }

    return json({ received: true });
  } catch (error) {
    console.error('stripe-webhook', event.type, error);
    // Une erreur de notre côté doit faire réessayer Stripe.
    return json({ error: (error as Error).message }, 500);
  }
});
