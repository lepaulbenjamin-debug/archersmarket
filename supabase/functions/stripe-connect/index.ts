/**
 * Inscription d'un vendeur au paiement sécurisé, et état de sa vérification.
 *
 * Crée son compte Stripe s'il n'en a pas, puis renvoie le lien vers le
 * formulaire d'identité hébergé par Stripe. Nous ne voyons jamais ses pièces
 * justificatives ni son IBAN : ils vont directement chez Stripe.
 *
 * Chaque appel relit aussi l'état du compte. Les comptes créés en API v2
 * n'émettent pas d'événement vers un webhook v1 : sans cette relecture, un
 * vendeur vérifié resterait indéfiniment marqué « en attente ».
 */
import { CORS, callerId, json, serviceClient } from '../_shared/context.ts';
import { stripeRequest, stripeV2Request } from '../_shared/stripe.ts';

/**
 * Stripe exige une URL https : un schéma d'application est refusé. La page
 * de retour du site rebondit vers l'app.
 */
const RETOUR = 'https://archersmarket.fr/retour-paiement.html';

interface StripeAccount {
  id: string;
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          payouts?: { status?: string };
          stripe_transfers?: { status?: string };
        };
      };
    };
  };
  requirements?: { entries?: unknown[] };
}

/** Une capacité n'est utilisable que lorsqu'elle est active. */
const estActive = (statut?: string) => statut === 'active';

const lireCompte = (account: StripeAccount) => {
  const balance = account.configuration?.recipient?.capabilities?.stripe_balance;
  return {
    charges_enabled: estActive(balance?.stripe_transfers?.status),
    payouts_enabled: estActive(balance?.payouts?.status),
    details_submitted: (account.requirements?.entries?.length ?? 0) === 0,
  };
};

const INCLUDE = 'include[0]=configuration.recipient&include[1]=requirements';

/**
 * L'appelant demande-t-il son tableau de bord plutôt que son état ?
 *
 * Le corps est lu prudemment : l'application appelle cette fonction sans corps
 * dans le cas courant, et `request.json()` lèverait sur une chaîne vide.
 */
async function veutLeTableauDeBord(request: Request): Promise<boolean> {
  if (request.method !== 'POST') return false;
  try {
    const brut = await request.clone().text();
    if (!brut) return false;
    return (JSON.parse(brut) as { action?: string }).action === 'dashboard';
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const userId = await callerId(request);
    if (!userId) return json({ error: 'Connexion requise.' }, 401);

    const db = serviceClient();

    // Le tableau de bord du vendeur : ses versements, son IBAN, ses documents.
    // Demandé explicitement plutôt que rendu à chaque lecture d'état — un lien
    // de connexion ne sert qu'une fois et expire en quelques minutes, en
    // fabriquer un à chaque affichage de l'écran serait du gaspillage et une
    // rangée de liens morts dans les journaux de Stripe.
    if (await veutLeTableauDeBord(request)) {
      const { data: compte } = await db
        .from('seller_accounts')
        .select('stripe_account_id, payouts_enabled')
        .eq('user_id', userId)
        .maybeSingle();

      if (!compte?.stripe_account_id) {
        return json({ error: 'Vous n’avez pas encore de compte de paiement.' }, 409);
      }
      if (!compte.payouts_enabled) {
        return json({ error: 'Terminez d’abord la vérification de votre identité.' }, 409);
      }

      const lien = await stripeRequest<{ url: string }>(
        'POST',
        `/accounts/${compte.stripe_account_id}/login_links`,
      );
      return json({ url: lien.url });
    }
    const { data: existing } = await db
      .from('seller_accounts')
      .select('stripe_account_id')
      .eq('user_id', userId)
      .maybeSingle();

    let accountId = existing?.stripe_account_id as string | undefined;

    if (!accountId) {
      // Stripe veut une adresse de contact : c'est là qu'il écrira au vendeur
      // pour ses vérifications.
      const { data: account } = await db.auth.admin.getUserById(userId);
      const email = account?.user?.email;
      if (!email) return json({ error: 'Adresse e-mail introuvable.' }, 400);

      const created = await stripeV2Request<StripeAccount>(
        'POST',
        '/core/accounts',
        {
          contact_email: email,
          identity: { country: 'fr', entity_type: 'individual' },
          // Nos vendeurs ne encaissent rien eux-mêmes : la plateforme reçoit
          // le paiement et leur transfère sa part. Ils n'ont donc besoin que
          // de recevoir des virements.
          configuration: {
            recipient: {
              capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
            },
          },
          dashboard: 'express',
          defaults: {
            currency: 'eur',
            // Le site qui présente les objets, c'est le nôtre. Sans cette
            // valeur, Stripe ouvre un écran « Informations sur votre
            // entreprise » et réclame une adresse web au vendeur — question
            // absurde posée à un particulier qui revend son arc, et premier
            // motif d'abandon de l'inscription.
            profile: { business_url: 'https://archersmarket.fr' },
            responsibilities: { fees_collector: 'application', losses_collector: 'application' },
          },
          metadata: { archers_market_user: userId },
          include: ['configuration.recipient', 'requirements'],
        },
        // Un compte créé deux fois, c'est un vendeur qui ne sait plus lequel
        // recevra son argent.
        { idempotencyKey: `account:${userId}` },
      );

      accountId = created.id;
      await db.from('seller_accounts').insert({
        user_id: userId,
        stripe_account_id: accountId,
        ...lireCompte(created),
      });
    } else {
      const current = await stripeV2Request<StripeAccount>(
        'GET',
        `/core/accounts/${accountId}?${INCLUDE}`,
      );
      await db
        .from('seller_accounts')
        .update({ ...lireCompte(current), updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    }

    const { data: statut } = await db
      .from('seller_accounts')
      .select('charges_enabled, payouts_enabled, details_submitted')
      .eq('user_id', userId)
      .maybeSingle();

    // Un vendeur déjà en règle n'a pas à repasser par le formulaire.
    if (statut?.charges_enabled && statut?.payouts_enabled) {
      return json({ ready: true, ...statut });
    }

    // Le lien expire vite et ne sert qu'une fois : on en refait un à chaque
    // passage plutôt que d'en conserver un périmé.
    const link = await stripeV2Request<{ url: string }>('POST', '/core/account_links', {
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['recipient'],
          refresh_url: RETOUR,
          return_url: RETOUR,
        },
      },
    });

    return json({ ready: false, url: link.url, ...statut });
  } catch (error) {
    console.error('stripe-connect', error);
    return json({ error: (error as Error).message }, 400);
  }
});
