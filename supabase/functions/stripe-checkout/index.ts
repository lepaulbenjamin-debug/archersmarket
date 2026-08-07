/**
 * Ouvre un paiement sécurisé pour une annonce.
 *
 * L'argent est encaissé sur le compte de la plateforme, sans destination :
 * c'est ce qui permet de le garder jusqu'à la réception. Le virement au
 * vendeur est une opération distincte, plus tard.
 *
 * Les montants sont recalculés ici, jamais reçus de l'app : un prix qui vient
 * du téléphone est un prix que l'acheteur peut choisir.
 */
import { CORS, callerId, json, serviceClient } from '../_shared/context.ts';
import { stripeRequest } from '../_shared/stripe.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const buyerId = await callerId(request);
    if (!buyerId) return json({ error: 'Connexion requise.' }, 401);

    const { listingId } = await request.json();
    if (!listingId) return json({ error: 'Annonce non précisée.' }, 400);

    const db = serviceClient();

    const { data: listing } = await db
      .from('listings')
      .select('id, seller_id, title, price, shipping, shipping_price, status')
      .eq('id', listingId)
      .maybeSingle();

    if (!listing) return json({ error: 'Cette annonce n’existe plus.' }, 404);
    if (listing.status !== 'active') return json({ error: 'Cette annonce n’est plus disponible.' }, 409);
    if (listing.seller_id === buyerId) return json({ error: 'On n’achète pas sa propre annonce.' }, 400);

    // Le vendeur doit avoir passé la vérification d'identité, sinon l'argent
    // encaissé n'aurait nulle part où aller.
    const { data: seller } = await db
      .from('seller_accounts')
      .select('stripe_account_id, charges_enabled, payouts_enabled')
      .eq('user_id', listing.seller_id)
      .maybeSingle();

    if (!seller?.charges_enabled || !seller?.payouts_enabled) {
      return json({ error: 'Ce vendeur n’accepte pas encore le paiement sécurisé.' }, 409);
    }

    // Une commande déjà ouverte pour cette annonce et cet acheteur se reprend
    // au lieu d'en créer une seconde.
    const { data: pending } = await db
      .from('orders')
      .select('id, stripe_payment_intent_id')
      .eq('listing_id', listingId)
      .eq('buyer_id', buyerId)
      .eq('status', 'pending')
      .maybeSingle();

    if (pending?.stripe_payment_intent_id) {
      const intent = await stripeRequest<{ client_secret: string }>(
        'GET',
        `/payment_intents/${pending.stripe_payment_intent_id}`,
      );
      return json({ orderId: pending.id, clientSecret: intent.client_secret });
    }

    const itemAmount = Math.round(Number(listing.price) * 100);
    const shippingAmount = listing.shipping ? Math.round(Number(listing.shipping_price ?? 0) * 100) : 0;

    // La règle de calcul vit en base : une seule définition fait foi.
    const { data: fee, error: feeError } = await db.rpc('protection_fee', {
      item_amount: itemAmount,
    });
    if (feeError) throw new Error('Calcul des frais impossible.');
    const protectionAmount = Number(fee);
    const totalAmount = itemAmount + shippingAmount + protectionAmount;

    const { data: order, error: orderError } = await db
      .from('orders')
      .insert({
        listing_id: listing.id,
        buyer_id: buyerId,
        seller_id: listing.seller_id,
        listing_title: listing.title,
        item_amount: itemAmount,
        shipping_amount: shippingAmount,
        protection_amount: protectionAmount,
        total_amount: totalAmount,
        status: 'pending',
      })
      .select('id')
      .single();
    if (orderError) throw new Error(orderError.message);

    const intent = await stripeRequest<{ id: string; client_secret: string }>(
      'POST',
      '/payment_intents',
      {
        amount: totalAmount,
        currency: 'eur',
        // Sans transfer_data : l'argent reste sur le compte de la plateforme.
        transfer_group: order.id,
        automatic_payment_methods: { enabled: true },
        description: `Archers Market — ${listing.title}`,
        metadata: {
          order_id: order.id,
          listing_id: listing.id,
          buyer_id: buyerId,
          seller_id: listing.seller_id,
        },
      },
      { idempotencyKey: `intent:${order.id}` },
    );

    await db
      .from('orders')
      .update({ stripe_payment_intent_id: intent.id })
      .eq('id', order.id);

    return json({
      orderId: order.id,
      clientSecret: intent.client_secret,
      breakdown: {
        item: itemAmount,
        shipping: shippingAmount,
        protection: protectionAmount,
        total: totalAmount,
      },
    });
  } catch (error) {
    console.error('stripe-checkout', error);
    return json({ error: (error as Error).message }, 400);
  }
});
