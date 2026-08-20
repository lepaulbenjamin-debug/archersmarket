/**
 * Libère l'argent vers les vendeurs.
 *
 * Balayage périodique, sans entrée : aucun appel du téléphone ne déclenche un
 * virement. L'app ne fait que constater une réception ; c'est ici, et
 * seulement ici, que l'argent bouge.
 *
 * Deux cas libèrent une commande :
 *   — l'acheteur a confirmé la réception ;
 *   — le colis est parti depuis assez longtemps et personne n'a rien signalé,
 *     sans quoi un acheteur silencieux bloquerait le vendeur indéfiniment.
 *
 * Le vendeur reçoit le prix de l'objet, et les frais de port seulement s'il a
 * expédié par ses propres moyens. Quand la plateforme a acheté l'étiquette
 * avec le port encaissé, lui virer ce port en plus reviendrait à le payer
 * deux fois. La plateforme garde la protection, sur laquelle Stripe prélève
 * sa commission.
 *
 * Un colis convoyé par un archer se règle en deux virements : le prix au
 * vendeur, la participation aux frais au convoyeur. Ils sont indépendants —
 * si le second échoue, le vendeur est payé quand même, et le convoyeur est
 * repris au balayage suivant. Un archer qui a fait la route ne doit pas
 * attendre qu'un problème de compte chez quelqu'un d'autre se règle.
 */
import { isScheduler, json, serviceClient } from '../_shared/context.ts';
import { stripeRequest } from '../_shared/stripe.ts';

/** Délai au-delà duquel un envoi sans nouvelle est réputé reçu. */
const JOURS_AVANT_LIBERATION_AUTO = 14;

interface Commande {
  id: string;
  seller_id: string;
  carrier_id: string | null;
  item_amount: number;
  shipping_amount: number;
  carrier_amount: number;
  carrier_transfer_id: string | null;
  stripe_charge_id: string | null;
}

/**
 * Vire au convoyeur sa participation aux frais.
 *
 * Séparé du virement au vendeur, et jamais fatal : rendre `false` fait
 * reprendre la commande au balayage suivant, sans rien défaire.
 */
async function payerLeConvoyeur(
  db: ReturnType<typeof serviceClient>,
  order: Commande,
): Promise<boolean> {
  if (!order.carrier_id || order.carrier_amount <= 0 || order.carrier_transfer_id) return true;

  const { data: convoyeur } = await db
    .from('seller_accounts')
    .select('stripe_account_id, payouts_enabled')
    .eq('user_id', order.carrier_id)
    .maybeSingle();

  if (!convoyeur?.payouts_enabled) return false;

  const transfer = await stripeRequest<{ id: string }>(
    'POST',
    '/transfers',
    {
      amount: order.carrier_amount,
      currency: 'eur',
      destination: convoyeur.stripe_account_id,
      transfer_group: order.id,
      source_transaction: order.stripe_charge_id ?? undefined,
      metadata: { order_id: order.id, role: 'carrier' },
    },
    { idempotencyKey: `carrier:${order.id}` },
  );

  await db
    .from('orders')
    .update({ carrier_transfer_id: transfer.id, updated_at: new Date().toISOString() })
    .eq('id', order.id)
    .is('carrier_transfer_id', null);

  return true;
}

Deno.serve(async (request) => {
  // verify_jwt ne prouve rien ici : il se contente d'accepter la clé
  // publiable, embarquée dans chaque copie de l'application. Un balayage qui
  // déplace de l'argent doit exiger mieux.
  if (!isScheduler(request)) return json({ error: 'Réservé au planificateur.' }, 401);

  const db = serviceClient();
  const limite = new Date(Date.now() - JOURS_AVANT_LIBERATION_AUTO * 86_400_000).toISOString();

  try {
    const { data: confirmees } = await db
      .from('orders')
      // Une seule chaîne littérale : découpée avec des `+`, supabase-js perd le
      // type de la ligne et rend `GenericStringError` à la place des colonnes.
      .select('id, seller_id, carrier_id, item_amount, shipping_amount, carrier_amount, carrier_transfer_id, stripe_charge_id, shipments(order_id)')
      .eq('status', 'delivered')
      // Une remise en main propre n'a aucun fonds derrière elle : virer quoi
      // que ce soit sortirait de notre trésorerie, pas de celle de l'acheteur.
      .eq('payment_mode', 'escrow')
      .is('stripe_transfer_id', null)
      .limit(100);

    const { data: silencieuses } = await db
      .from('orders')
      // Une seule chaîne littérale : découpée avec des `+`, supabase-js perd le
      // type de la ligne et rend `GenericStringError` à la place des colonnes.
      .select('id, seller_id, carrier_id, item_amount, shipping_amount, carrier_amount, carrier_transfer_id, stripe_charge_id, shipments(order_id)')
      .eq('status', 'shipped')
      .eq('payment_mode', 'escrow')
      .is('stripe_transfer_id', null)
      .lt('shipped_at', limite)
      .limit(100);

    const aTraiter = [...(confirmees ?? []), ...(silencieuses ?? [])];
    const resultats: Array<{ order: string; ok: boolean; detail?: string }> = [];

    for (const order of aTraiter) {
      try {
        const { data: seller } = await db
          .from('seller_accounts')
          .select('stripe_account_id, payouts_enabled')
          .eq('user_id', order.seller_id)
          .maybeSingle();

        if (!seller?.payouts_enabled) {
          // Le vendeur n'est plus en règle : l'argent reste où il est plutôt
          // que de partir vers un compte qui le rejetterait.
          resultats.push({ order: order.id, ok: false, detail: 'vendeur non vérifié' });
          continue;
        }

        // DAC7 : au-delà du seuil, un vendeur qui n'a rien fourni après
        // relances doit voir son paiement suspendu. Suspendu, pas perdu — la
        // somme reste en séquestre et partira au balayage suivant, le jour où
        // il complétera son dossier.
        const { data: retenir } = await db.rpc('dac7_retenir', { seller: order.seller_id });
        if (retenir === true) {
          resultats.push({ order: order.id, ok: false, detail: 'DAC7 : dossier fiscal manquant' });
          continue;
        }

        // Le port ne suit que s'il est resté dans la poche du vendeur — et
        // en convoyage il n'y reste pas non plus : la participation revient à
        // l'archer qui a fait la route.
        const etiquetteAchetee = Array.isArray(order.shipments)
          ? order.shipments.length > 0
          : Boolean(order.shipments);
        const montant =
          order.item_amount
          + (etiquetteAchetee ? 0 : order.shipping_amount - order.carrier_amount);
        const transfer = await stripeRequest<{ id: string }>(
          'POST',
          '/transfers',
          {
            amount: montant,
            currency: 'eur',
            destination: seller.stripe_account_id,
            transfer_group: order.id,
            // Rattaché à l'encaissement d'origine : le virement part sans
            // attendre que les fonds soient devenus disponibles, ce qui prend
            // une semaine au démarrage. L'acheteur, lui, confirme sa réception
            // en deux jours.
            source_transaction: order.stripe_charge_id ?? undefined,
            metadata: { order_id: order.id },
          },
          // La clé d'idempotence est la commande : un balayage rejoué ne peut
          // pas payer deux fois.
          { idempotencyKey: `transfer:${order.id}` },
        );

        await db
          .from('orders')
          .update({
            status: 'released',
            stripe_transfer_id: transfer.id,
            released_at: new Date().toISOString(),
            delivered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.id)
          .is('stripe_transfer_id', null);

        const convoyeurPaye = await payerLeConvoyeur(db, order);
        resultats.push({
          order: order.id,
          ok: true,
          detail: convoyeurPaye ? undefined : 'convoyeur à reprendre',
        });
      } catch (error) {
        // Une commande en échec ne doit pas empêcher les suivantes.
        console.error('stripe-release', order.id, error);
        resultats.push({ order: order.id, ok: false, detail: (error as Error).message });
      }
    }

    // Les convoyeurs restés impayés d'un tour précédent : leur commande est
    // soldée pour le vendeur, donc plus aucune requête ci-dessus ne la voit.
    const { data: arrieres } = await db
      .from('orders')
      // Une seule chaîne littérale : découpée avec des `+`, supabase-js perd le
      // type de la ligne et rend `GenericStringError` à la place des colonnes.
      .select('id, seller_id, carrier_id, item_amount, shipping_amount, carrier_amount, carrier_transfer_id, stripe_charge_id, shipments(order_id)')
      .eq('status', 'released')
      .not('carrier_id', 'is', null)
      .is('carrier_transfer_id', null)
      .gt('carrier_amount', 0)
      .limit(100);

    for (const order of arrieres ?? []) {
      try {
        const paye = await payerLeConvoyeur(db, order);
        if (!paye) resultats.push({ order: order.id, ok: false, detail: 'convoyeur non vérifié' });
      } catch (error) {
        console.error('stripe-release convoyeur', order.id, error);
        resultats.push({ order: order.id, ok: false, detail: (error as Error).message });
      }
    }

    // Les relances fiscales voyagent avec le balayage plutôt que sur leur
    // propre horloge : c'est le même rythme, et un planificateur de moins.
    // Leur échec ne compromet pas les virements, qui sont déjà passés.
    let relances = 0;
    try {
      const { data } = await db.rpc('dac7_relancer');
      relances = Number(data ?? 0);
    } catch (error) {
      console.error('relances DAC7 :', error);
    }

    return json({
      examinees: aTraiter.length,
      arrieres: arrieres?.length ?? 0,
      relances,
      resultats,
    });
  } catch (error) {
    console.error('stripe-release', error);
    return json({ error: (error as Error).message }, 500);
  }
});
