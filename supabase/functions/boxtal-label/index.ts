/**
 * Achète l'étiquette d'une commande payée, et la range à l'abri.
 *
 * C'est la plateforme qui paie le transporteur, avec le port déjà encaissé
 * auprès de l'acheteur : le vendeur n'avance rien et n'ouvre aucun compte.
 * En contrepartie, ce port ne doit plus lui être viré — c'est l'existence de
 * la ligne `shipments` qui le dit à la fonction de virement.
 *
 * Générer l'étiquette ne déclare pas l'envoi : le colis n'est pas encore
 * déposé. Le vendeur le confirme ensuite, ou le suivi s'en charge.
 */
import { CORS, callerId, json, serviceClient } from '../_shared/context.ts';
import {
  CONTENU_SPORT, boxtalGet, boxtalPost, exigePointDepot, exigePointRetrait, fetchLabel,
  firstText, offreRealisable, parcelOf, parcelParams, pathText, readOffers,
} from '../_shared/boxtal.ts';

const demain = (): string =>
  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const cents = (value: string | null): number =>
  value ? Math.round(Number(value.replace(',', '.')) * 100) : 0;

/** Boxtal colle la référence à la fin de cette adresse quand le suivi bouge. */
function urlPush(): string {
  const base = Deno.env.get('SUPABASE_URL') ?? '';
  const jeton = Deno.env.get('BOXTAL_PUSH_TOKEN') ?? '';
  return `${base}/functions/v1/boxtal-tracking?token=${encodeURIComponent(jeton)}&ref=`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const sellerId = await callerId(request);
    if (!sellerId) return json({ error: 'Connexion requise.' }, 401);

    const { orderId, dropoffCode, dropoffLabel } = await request.json();
    if (!orderId) return json({ error: 'Commande non précisée.' }, 400);

    const db = serviceClient();

    const { data: order } = await db
      .from('orders')
      // Une seule chaîne littérale : découpée avec des `+`, supabase-js perd
      // le type de la ligne et rend une erreur générique.
      .select('id, seller_id, buyer_id, listing_id, listing_title, item_amount, status, shipping_mode, ship_to_civility, ship_to_name, ship_to_address, ship_to_zip, ship_to_city, ship_to_country, ship_to_phone, relay_code, carrier_operator, carrier_service')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) return json({ error: 'Commande introuvable.' }, 404);
    if (order.seller_id !== sellerId) return json({ error: 'Cette commande n’est pas la vôtre.' }, 403);
    if (order.status !== 'paid') {
      return json({ error: 'L’étiquette s’édite une fois le paiement encaissé.' }, 409);
    }
    if (order.shipping_mode === 'hand') {
      return json({ error: 'Cette vente se fait en main propre.' }, 409);
    }
    if (!order.carrier_operator || !order.carrier_service) {
      return json({ error: 'Aucun transporteur n’a été retenu pour cette commande.' }, 409);
    }

    // Déjà achetée : on rend la même, sans repasser commande. Un vendeur qui
    // appuie deux fois ne doit pas payer deux étiquettes.
    const { data: existante } = await db
      .from('shipments')
      .select('reference, label_url, tracking_number, operator_label')
      .eq('order_id', order.id)
      .maybeSingle();
    if (existante) {
      const lien = await signedLabel(db, order.id);
      return json({ ...existante, label_url: lien ?? existante.label_url, reused: true });
    }

    const { data: depart } = await db
      .from('seller_addresses')
      .select('civility, full_name, address, zip, city, country, phone')
      .eq('user_id', sellerId)
      .maybeSingle();
    if (!depart) {
      return json({ error: 'Renseignez votre adresse d’expédition avant d’éditer l’étiquette.' }, 409);
    }

    const { data: listing } = await db
      .from('listings')
      .select('parcel_size')
      .eq('id', order.listing_id ?? '')
      .maybeSingle();

    const colis = parcelOf(listing?.parcel_size);
    const [prenom, ...reste] = String(order.ship_to_name ?? '').trim().split(/\s+/);

    // Ce que l'offre exigera vraiment. On le redemande au lieu de le supposer :
    // les exigences varient d'un transporteur à l'autre, et une commande
    // refusée après paiement laisserait l'acheteur payé et le colis bloqué.
    const cotation = await boxtalGet('api/v1/cotation', {
      'shipper.country': depart.country,
      'shipper.zipcode': depart.zip,
      'shipper.city': depart.city,
      'shipper.type': 'individual',
      'recipient.country': order.ship_to_country ?? 'FR',
      'recipient.zipcode': order.ship_to_zip ?? '',
      'recipient.city': order.ship_to_city ?? '',
      'recipient.type': 'individual',
      collection_date: demain(),
      content_code: CONTENU_SPORT,
      'colis.valeur': (order.item_amount / 100).toFixed(2),
      ...parcelParams(colis),
    });

    const offre = readOffers(cotation).find(
      (candidate) =>
        candidate.operatorCode === order.carrier_operator &&
        candidate.serviceCode === order.carrier_service,
    );
    if (!offre || !offreRealisable(offre)) {
      return json(
        { error: 'Ce transporteur ne dessert plus cette adresse. Contactez l’acheteur.' },
        409,
      );
    }

    // Le point de dépôt est celui du vendeur — il ne peut pas être choisi à
    // l'achat, l'acheteur ne sait pas d'où part le colis. On le réclame ici,
    // et l'app présente alors la liste.
    if (exigePointDepot(offre) && !dropoffCode) {
      return json(
        {
          error: 'Choisissez le point relais où vous déposerez le colis.',
          needsDropoff: true,
          operator: offre.operatorCode,
          from: { zip: depart.zip, city: depart.city, country: depart.country },
        },
        409,
      );
    }

    const parametres: Record<string, string | number | boolean> = {
      'shipper.country': depart.country,
      'shipper.zipcode': depart.zip,
      'shipper.city': depart.city,
      'shipper.address': depart.address,
      'shipper.type': 'individual',
      'shipper.title': depart.civility,
      'shipper.firstname': depart.full_name.split(/\s+/)[0],
      'shipper.lastname': depart.full_name.split(/\s+/).slice(1).join(' ') || depart.full_name,
      'shipper.phone': depart.phone,
      'shipper.email': Deno.env.get('BOXTAL_CONTACT_EMAIL') ?? 'contact@archersmarket.fr',

      'recipient.country': order.ship_to_country ?? 'FR',
      'recipient.zipcode': order.ship_to_zip ?? '',
      'recipient.city': order.ship_to_city ?? '',
      'recipient.address': order.ship_to_address ?? '',
      'recipient.type': 'individual',
      'recipient.title': order.ship_to_civility ?? 'M',
      'recipient.firstname': prenom || 'Client',
      'recipient.lastname': reste.join(' ') || prenom || 'Client',
      'recipient.phone': order.ship_to_phone ?? '',
      'recipient.email': Deno.env.get('BOXTAL_CONTACT_EMAIL') ?? 'contact@archersmarket.fr',

      collection_date: demain(),
      content_code: CONTENU_SPORT,
      'colis.description': String(order.listing_title).slice(0, 60),
      'colis.valeur': (order.item_amount / 100).toFixed(2),
      'assurance.selection': false,
      operator: order.carrier_operator,
      service: order.carrier_service,
      url_push: urlPush(),
      ...parcelParams(colis),
    };

    // Retrait et dépôt sont deux choses distinctes : l'un est le point où
    // l'acheteur récupère, l'autre celui où le vendeur remet. Une offre peut
    // exiger l'un, l'autre, ou les deux.
    if (exigePointRetrait(offre) && order.relay_code) {
      parametres['retrait.pointrelais'] = order.relay_code;
    }
    if (exigePointDepot(offre)) {
      parametres['depot.pointrelais'] = String(dropoffCode);
    }

    const reponse = await boxtalPost('api/v1/order', parametres);
    const reference = firstText(reponse, 'reference');
    if (!reference) throw new Error('Boxtal n’a pas renvoyé de référence d’expédition.');

    const confirmation = reponse.children[0]?.children[0]?.children.find((n) => n.name === 'offer') ?? null;

    // On enregistre avant de télécharger : si le PDF tarde, l'expédition
    // existe déjà chez le transporteur et ne doit pas être commandée deux fois.
    const { error: insertError } = await db.from('shipments').insert({
      order_id: order.id,
      reference,
      operator_code: pathText(confirmation, 'operator', 'code') ?? order.carrier_operator,
      operator_label: pathText(confirmation, 'operator', 'label') ?? order.carrier_operator,
      service_code: pathText(confirmation, 'service', 'code') ?? order.carrier_service,
      service_label: pathText(confirmation, 'service', 'label') ?? order.carrier_service,
      cost_amount: cents(pathText(confirmation, 'price', 'tax-inclusive')),
      dropoff_code: dropoffCode ?? null,
      dropoff_label: dropoffLabel ?? null,
    });
    if (insertError) throw new Error(insertError.message);

    const pdf = await fetchLabel(reference);
    const chemin = `${order.id}.pdf`;
    const { error: uploadError } = await db.storage
      .from('labels')
      .upload(chemin, pdf, { contentType: 'application/pdf', upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    await db.from('shipments').update({ label_url: chemin }).eq('order_id', order.id);

    return json({
      reference,
      label_url: await signedLabel(db, order.id),
      operator_label: pathText(confirmation, 'operator', 'label') ?? order.carrier_operator,
      reused: false,
    });
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
});

/** Lien de téléchargement à durée limitée : l'étiquette n'est pas publique. */
async function signedLabel(
  db: ReturnType<typeof serviceClient>,
  orderId: string,
): Promise<string | null> {
  const { data } = await db.storage.from('labels').createSignedUrl(`${orderId}.pdf`, 3600);
  return data?.signedUrl ?? null;
}
