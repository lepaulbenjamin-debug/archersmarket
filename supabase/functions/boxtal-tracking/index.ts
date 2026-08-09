/**
 * Reçoit les avis de suivi de Boxtal et met la commande à jour.
 *
 * Boxtal appelle l'adresse déposée à la commande, en y collant la référence
 * de l'expédition. L'avis ne porte pas l'état : on va le lire chez Boxtal
 * plutôt que de croire l'appelant, qui n'est pas authentifié autrement que
 * par un jeton partagé.
 *
 * Cette fonction se déploie sans contrôle de jeton Supabase — Boxtal n'en a
 * pas — d'où le jeton propre vérifié ici.
 */
import { CORS, json, serviceClient } from '../_shared/context.ts';
import { boxtalGet, firstText } from '../_shared/boxtal.ts';

/** Comparaison à durée constante : sinon le jeton se devine caractère à caractère. */
function jetonValide(recu: string): boolean {
  const attendu = Deno.env.get('BOXTAL_PUSH_TOKEN') ?? '';
  if (!attendu || recu.length !== attendu.length) return false;
  let diff = 0;
  for (let i = 0; i < recu.length; i++) diff |= recu.charCodeAt(i) ^ attendu.charCodeAt(i);
  return diff === 0;
}

/**
 * Les états qui signent une remise au destinataire. On reste prudent : un
 * état mal interprété lancerait le délai de recours de l'acheteur sans qu'il
 * ait rien reçu. Dans le doute, on note et on laisse l'acheteur confirmer.
 */
const LIVRE = /^(LIV|DEL|DELIVERED)$|livr[ée]|delivered/i;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const url = new URL(request.url);
    if (!jetonValide(url.searchParams.get('token') ?? '')) {
      return json({ error: 'Appel non autorisé.' }, 401);
    }

    const reference = (url.searchParams.get('ref') ?? '').trim();
    if (!/^[0-9a-zA-Z]{10,30}$/.test(reference)) {
      return json({ error: 'Référence invalide.' }, 400);
    }

    const db = serviceClient();
    const { data: expedition } = await db
      .from('shipments')
      .select('order_id')
      .eq('reference', reference)
      .maybeSingle();

    // Une référence inconnue n'est pas une erreur de Boxtal : on acquitte
    // pour qu'il cesse de réessayer, sans rien écrire.
    if (!expedition) return json({ ok: true, ignored: true });

    const etat = await boxtalGet(`api/v1/order_status/${reference}/informations`, {});
    const statut = firstText(etat, 'state') ?? '';
    const suivi = firstText(etat, 'carrier_reference');

    await db
      .from('shipments')
      .update({
        tracking_status: statut || null,
        tracking_number: suivi,
        tracking_updated_at: new Date().toISOString(),
      })
      .eq('reference', reference);

    const { data: order } = await db
      .from('orders')
      .select('id, status')
      .eq('id', expedition.order_id)
      .maybeSingle();
    if (!order) return json({ ok: true });

    const maintenant = new Date().toISOString();

    // Le colis a bougé : la commande passe à « expédié » si elle ne l'est pas.
    if (order.status === 'paid') {
      await db
        .from('orders')
        .update({
          status: 'shipped',
          tracking_number: suivi,
          shipped_at: maintenant,
          updated_at: maintenant,
        })
        .eq('id', order.id)
        .eq('status', 'paid');
    }

    // Livré : le délai de recours de l'acheteur commence. On ne touche pas à
    // une commande en litige, ni à une commande déjà soldée.
    if (LIVRE.test(statut) && ['paid', 'shipped'].includes(order.status)) {
      await db
        .from('orders')
        .update({ status: 'delivered', delivered_at: maintenant, updated_at: maintenant })
        .eq('id', order.id)
        .in('status', ['paid', 'shipped']);
    }

    return json({ ok: true, state: statut });
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
});
