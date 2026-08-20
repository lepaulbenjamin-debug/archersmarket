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
import {
  CONTENU_SPORT, assurable, boxtalGet, parcelOf, parcelParams, readOffers,
} from '../_shared/boxtal.ts';

interface Delivery {
  mode?: 'home' | 'relay' | 'hand' | 'archer';
  civility?: 'M' | 'Mme';
  name?: string;
  address?: string;
  zip?: string;
  city?: string;
  country?: string;
  phone?: string;
  operator?: string;
  service?: string;
  relayCode?: string;
  relayLabel?: string;
  /** Le trajet retenu, en convoyage entre archers. */
  tripId?: string;
}

/**
 * Recote le port choisi plutôt que de croire le prix reçu.
 *
 * L'app a déjà vu ce tarif à l'écran, mais le lui redemander reviendrait à
 * laisser l'acheteur fixer son propre port. On redemande donc l'offre à
 * Boxtal et on retient *son* prix ; si elle a disparu entre-temps, on refuse
 * plutôt que de facturer au hasard.
 */
async function coteLePort(
  db: ReturnType<typeof serviceClient>,
  listing: { seller_id: string; price: number | string; parcel_size: string | null },
  delivery: Delivery,
): Promise<{ port: number; assurance: number }> {
  const { data: depart } = await db
    .from('seller_addresses')
    .select('zip, city, country')
    .eq('user_id', listing.seller_id)
    .maybeSingle();
  if (!depart) throw new Error('Le vendeur n’a pas renseigné son adresse d’expédition.');

  const document = await boxtalGet('api/v1/cotation', {
    'shipper.country': depart.country,
    'shipper.zipcode': depart.zip,
    'shipper.city': depart.city,
    'shipper.type': 'individual',
    'recipient.country': (delivery.country ?? 'FR').toUpperCase(),
    'recipient.zipcode': delivery.zip ?? '',
    'recipient.city': delivery.city ?? '',
    'recipient.type': 'individual',
    collection_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    content_code: CONTENU_SPORT,
    'colis.valeur': Number(listing.price).toFixed(2),
    ...parcelParams(parcelOf(listing.parcel_size)),
  });

  const offre = readOffers(document).find(
    (candidate) =>
      candidate.operatorCode === delivery.operator &&
      candidate.serviceCode === delivery.service,
  );
  if (!offre) {
    throw new Error('Ce mode de livraison n’est plus disponible : choisissez-en un autre.');
  }

  // Le port et l'assurance sont recotés ici, comme le reste : le prix qui
  // engage est celui que le serveur vient de lire, jamais celui que le
  // téléphone a retenu il y a cinq minutes.
  const valeur = Math.round(Number(listing.price) * 100);
  return {
    port: offre.priceCents,
    assurance: assurable(valeur, offre) ? offre.insuranceCents : 0,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const buyerId = await callerId(request);
    if (!buyerId) return json({ error: 'Connexion requise.' }, 401);

    const { listingId, delivery = {} } = (await request.json()) as {
      listingId?: string;
      delivery?: Delivery;
    };
    if (!listingId) return json({ error: 'Annonce non précisée.' }, 400);

    const mode = delivery.mode ?? 'hand';
    if (mode !== 'hand') {
      if (!delivery.name || !delivery.address || !delivery.zip || !delivery.city) {
        return json({ error: 'Adresse de livraison incomplète.' }, 400);
      }
      if (mode === 'archer') {
        if (!delivery.tripId) return json({ error: 'Aucun trajet choisi.' }, 400);
      } else {
        if (!delivery.operator || !delivery.service) {
          return json({ error: 'Aucun transporteur choisi.' }, 400);
        }
        if (mode === 'relay' && !delivery.relayCode) {
          return json({ error: 'Choisissez un point relais.' }, 400);
        }
      }
    }

    const db = serviceClient();

    const { data: listing } = await db
      .from('listings')
      .select('id, seller_id, title, price, shipping, shipping_price, parcel_size, status')
      .eq('id', listingId)
      .maybeSingle();

    if (!listing) return json({ error: 'Cette annonce n’existe plus.' }, 404);
    if (listing.status !== 'active') return json({ error: 'Cette annonce n’est plus disponible.' }, 409);
    if (listing.seller_id === buyerId) return json({ error: 'On n’achète pas sa propre annonce.' }, 400);

    // En remise en main propre, nous n'encaissons que nos frais : l'argent de
    // l'arc passe directement d'une main à l'autre. Le vendeur n'a donc pas
    // besoin d'être vérifié chez Stripe — et c'est cette barrière-là qui
    // empêchait la plupart des ventes locales.
    if (mode !== 'hand') {
      const { data: seller } = await db
        .from('seller_accounts')
        .select('stripe_account_id, charges_enabled, payouts_enabled')
        .eq('user_id', listing.seller_id)
        .maybeSingle();

      if (!seller?.charges_enabled || !seller?.payouts_enabled) {
        return json({ error: 'Ce vendeur n’accepte pas encore le paiement sécurisé.' }, 409);
      }
    }

    const itemAmount = Math.round(Number(listing.price) * 100);

    // En convoyage, le « port » est la participation aux frais du trajet, et
    // elle est lue sur le trajet lui-même : c'est le convoyeur qui l'a fixée,
    // pas l'acheteur.
    let trajet: { id: string; carrier_id: string; contribution: number } | null = null;
    if (mode === 'archer') {
      const { data } = await db
        .from('archer_trips')
        .select('id, carrier_id, contribution, status, depart_on')
        .eq('id', delivery.tripId ?? '')
        .maybeSingle();

      if (!data || data.status !== 'open') {
        return json({ error: 'Ce trajet n’est plus proposé.' }, 409);
      }
      if (data.depart_on < new Date().toISOString().slice(0, 10)) {
        return json({ error: 'Ce trajet est déjà parti.' }, 409);
      }
      if (data.carrier_id === buyerId || data.carrier_id === listing.seller_id) {
        return json({ error: 'Le convoyeur ne peut pas être une partie à la vente.' }, 409);
      }

      // Le plafond vient de la caisse de garantie, et il bouge : autant le
      // dire ici plutôt que de laisser la contrainte parler en base.
      const { data: plafond } = await db.rpc('archer_value_cap');
      if (Number(plafond) < itemAmount) {
        return json(
          {
            error: `Le convoyage entre archers est limité à ${Math.floor(Number(plafond) / 100)} € par colis pour le moment. Choisissez un transporteur.`,
          },
          409,
        );
      }
      trajet = { id: data.id, carrier_id: data.carrier_id, contribution: data.contribution };
    }

    const port = mode === 'hand'
      ? { port: 0, assurance: 0 }
      : trajet
        ? { port: trajet.contribution, assurance: 0 }
        : await coteLePort(db, listing, delivery);
    // L'assurance fait partie du port : c'est une seule ligne pour l'acheteur,
    // et deux nombres dans nos comptes.
    const shippingAmount = port.port + port.assurance;

    // Les règles de calcul vivent en base : une seule définition fait foi.
    // En remise, c'est un forfait ; en livraison, un pourcentage du prix.
    const { data: fee, error: feeError } = mode === 'hand'
      ? await db.rpc('handover_fee')
      : await db.rpc('protection_fee', { item_amount: itemAmount });
    if (feeError) throw new Error('Calcul des frais impossible.');
    const protectionAmount = Number(fee);

    // En direct, l'acheteur ne nous règle que la mise en relation : le prix de
    // l'arc ne transite jamais par nous, donc il n'entre pas dans le total.
    const totalAmount = mode === 'hand'
      ? protectionAmount
      : itemAmount + shippingAmount + protectionAmount;

    const livraison = {
      payment_mode: mode === 'hand' ? 'direct' : 'escrow',
      shipping_mode: mode,
      ship_to_civility: delivery.civility === 'Mme' ? 'Mme' : 'M',
      ship_to_name: mode === 'hand' ? null : delivery.name,
      ship_to_address: mode === 'hand' ? null : delivery.address,
      ship_to_zip: mode === 'hand' ? null : delivery.zip,
      ship_to_city: mode === 'hand' ? null : delivery.city,
      ship_to_country: (delivery.country ?? 'FR').toUpperCase(),
      ship_to_phone: mode === 'hand' ? null : (delivery.phone ?? null),
      insurance_amount: port.assurance,
      relay_code: mode === 'relay' ? delivery.relayCode : null,
      relay_label: mode === 'relay' ? (delivery.relayLabel ?? null) : null,
      carrier_operator: mode === 'home' || mode === 'relay' ? delivery.operator : null,
      carrier_service: mode === 'home' || mode === 'relay' ? delivery.service : null,
      // La participation est le port, et elle est aussi ce que le convoyeur
      // recevra : deux colonnes pour un seul nombre, parce que le virement ne
      // doit pas avoir à deviner laquelle des deux il suit.
      carrier_id: trajet?.carrier_id ?? null,
      trip_id: trajet?.id ?? null,
      carrier_amount: trajet?.contribution ?? 0,
    };

    // Une commande déjà ouverte pour cette annonce et cet acheteur se reprend
    // au lieu d'en créer une seconde. Mais l'acheteur a pu changer d'adresse
    // ou de transporteur entre-temps : dans ce cas le montant a bougé, et
    // rendre l'ancien code de paiement ferait payer l'ancien prix.
    const { data: pending } = await db
      .from('orders')
      .select('id, stripe_payment_intent_id, total_amount')
      .eq('listing_id', listingId)
      .eq('buyer_id', buyerId)
      .eq('status', 'pending')
      .maybeSingle();

    if (pending?.stripe_payment_intent_id) {
      await db
        .from('orders')
        .update({
          ...livraison,
          shipping_amount: shippingAmount,
          total_amount: totalAmount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pending.id);

      const intent =
        pending.total_amount === totalAmount
          ? await stripeRequest<{ client_secret: string }>(
              'GET',
              `/payment_intents/${pending.stripe_payment_intent_id}`,
            )
          : await stripeRequest<{ client_secret: string }>(
              'POST',
              `/payment_intents/${pending.stripe_payment_intent_id}`,
              { amount: totalAmount },
            );

      return json({
        orderId: pending.id,
        clientSecret: intent.client_secret,
        breakdown: {
          item: itemAmount,
          shipping: shippingAmount,
          protection: protectionAmount,
          total: totalAmount,
        },
      });
    }

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
        ...livraison,
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
