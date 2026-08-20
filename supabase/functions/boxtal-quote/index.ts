/**
 * Propose les transporteurs possibles pour une annonce, vers une adresse.
 *
 * La cotation est demandée ici et non depuis l'app : les identifiants Boxtal
 * ne quittent pas le serveur, et surtout le prix affiché à l'acheteur doit
 * être celui que la commande retiendra. Un prix qui vient du téléphone est un
 * prix que l'acheteur peut choisir.
 */
import { CORS, callerId, json, serviceClient } from '../_shared/context.ts';
import {
  CONTENU_SPORT, assurable, boxtalGet, offreRealisable, parcelOf, parcelParams, readOffers,
} from '../_shared/boxtal.ts';

/** Demain : la plupart des transporteurs refusent un enlèvement le jour même. */
function demain(): string {
  const jour = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return jour.toISOString().slice(0, 10);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const buyerId = await callerId(request);
    if (!buyerId) return json({ error: 'Connexion requise.' }, 401);

    const { listingId, zip, city, country } = await request.json();
    if (!listingId) return json({ error: 'Annonce non précisée.' }, 400);
    if (!zip || !city) return json({ error: 'Adresse de livraison incomplète.' }, 400);

    const db = serviceClient();

    const { data: listing } = await db
      .from('listings')
      .select('id, seller_id, price, parcel_size, shipping, status')
      .eq('id', listingId)
      .maybeSingle();

    if (!listing) return json({ error: 'Annonce introuvable.' }, 404);
    if (listing.status !== 'active') return json({ error: 'Cette annonce n’est plus disponible.' }, 409);
    if (!listing.shipping) return json({ error: 'Ce vendeur ne propose pas l’envoi.' }, 409);
    if (listing.seller_id === buyerId) return json({ error: 'Vous êtes le vendeur.' }, 409);

    const { data: depart } = await db
      .from('seller_addresses')
      .select('zip, city, country')
      .eq('user_id', listing.seller_id)
      .maybeSingle();

    if (!depart) {
      return json(
        { error: 'Le vendeur n’a pas encore renseigné son adresse d’expédition.' },
        409,
      );
    }

    const colis = parcelOf(listing.parcel_size);
    const document = await boxtalGet('api/v1/cotation', {
      'shipper.country': depart.country,
      'shipper.zipcode': depart.zip,
      'shipper.city': depart.city,
      'shipper.type': 'individual',
      'recipient.country': String(country ?? 'FR').toUpperCase(),
      'recipient.zipcode': String(zip),
      'recipient.city': String(city),
      'recipient.type': 'individual',
      collection_date: demain(),
      content_code: CONTENU_SPORT,
      'colis.valeur': Number(listing.price).toFixed(2),
      ...parcelParams(colis),
    });

    // On n'affiche que ce qu'on saura réserver : une offre retenue puis
    // refusée à l'étiquette laisserait un acheteur payé et un colis bloqué.
    // Du moins cher au plus cher, c'est l'ordre dans lequel on les lit.
    // Au-dessus du seuil, l'assurance n'est pas une option laissée à
    // l'acheteur : c'est nous qui devrons le rembourser, donc c'est nous qui
    // couvrons. Le prix annoncé la comprend, et le dit.
    const itemAmount = Math.round(Number(listing.price) * 100);
    const offres = readOffers(document)
      .filter(offreRealisable)
      .map((offre) => {
        const assurance = assurable(itemAmount, offre) ? offre.insuranceCents : 0;
        return { ...offre, insuranceCents: assurance, priceCents: offre.priceCents + assurance };
      })
      .sort((a, b) => a.priceCents - b.priceCents);
    if (offres.length === 0) {
      return json({ error: 'Aucun transporteur ne dessert cette adresse pour ce colis.' }, 409);
    }

    return json({ parcel: colis, offers: offres, insuredValue: itemAmount });
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
});
