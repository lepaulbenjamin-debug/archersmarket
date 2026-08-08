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
 * Le vendeur reçoit le prix de l'objet et les frais de port. La plateforme
 * garde la protection, sur laquelle Stripe prélève sa commission.
 */
import { isScheduler, json, serviceClient } from '../_shared/context.ts';
import { stripeRequest } from '../_shared/stripe.ts';

/** Délai au-delà duquel un envoi sans nouvelle est réputé reçu. */
const JOURS_AVANT_LIBERATION_AUTO = 14;

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
      .select('id, seller_id, item_amount, shipping_amount, stripe_charge_id')
      .eq('status', 'delivered')
      .is('stripe_transfer_id', null)
      .limit(100);

    const { data: silencieuses } = await db
      .from('orders')
      .select('id, seller_id, item_amount, shipping_amount, stripe_charge_id')
      .eq('status', 'shipped')
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

        const montant = order.item_amount + order.shipping_amount;
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

        resultats.push({ order: order.id, ok: true });
      } catch (error) {
        // Une commande en échec ne doit pas empêcher les suivantes.
        console.error('stripe-release', order.id, error);
        resultats.push({ order: order.id, ok: false, detail: (error as Error).message });
      }
    }

    return json({ examinees: aTraiter.length, resultats });
  } catch (error) {
    console.error('stripe-release', error);
    return json({ error: (error as Error).message }, 500);
  }
});
