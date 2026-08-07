import { fail, supabase } from '@/services/supabase';

/**
 * Paiement sécurisé : l'acheteur paie sur le compte de la plateforme, l'argent
 * n'arrive chez le vendeur qu'une fois la réception constatée.
 *
 * Rien de sensible ici. Les clés Stripe vivent dans les fonctions Edge ; l'app
 * ne fait que demander et lire.
 */

/** Tous les montants circulent en centimes, en entiers. */
export type Cents = number;

export const PROTECTION_RATE = 0.05;
export const PROTECTION_FIXED: Cents = 70;

/**
 * Frais de protection à la charge de l'acheteur : 5 % du prix + 0,70 €.
 * Le vendeur touche son prix entier.
 *
 * Cette règle existe aussi en base (fonction `protection_fee`), qui fait foi
 * au moment de l'encaissement. Ici, c'est pour l'afficher avant l'achat ; un
 * test vérifie que les deux ne divergent jamais.
 */
export function protectionFee(itemAmount: Cents): Cents {
  return Math.max(0, Math.round(itemAmount * PROTECTION_RATE) + PROTECTION_FIXED);
}

export interface PriceBreakdown {
  item: Cents;
  shipping: Cents;
  protection: Cents;
  total: Cents;
}

/** Ce que l'acheteur paiera, poste par poste. */
export function priceBreakdown(itemAmount: Cents, shippingAmount: Cents = 0): PriceBreakdown {
  const protection = protectionFee(itemAmount);
  return {
    item: itemAmount,
    shipping: shippingAmount,
    protection,
    total: itemAmount + shippingAmount + protection,
  };
}

/** Des centimes vers « 12,50 € ». */
export const formatCents = (amount: Cents): string =>
  `${(amount / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Un prix d'annonce, en euros, vers des centimes. */
export const toCents = (euros: number): Cents => Math.round(euros * 100);

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'shipped'
  | 'delivered'
  | 'released'
  | 'refunded'
  | 'cancelled'
  | 'disputed';

export interface Order {
  id: string;
  listingId: string | null;
  listingTitle: string;
  buyerId: string | null;
  sellerId: string | null;
  itemAmount: Cents;
  shippingAmount: Cents;
  protectionAmount: Cents;
  totalAmount: Cents;
  status: OrderStatus;
  trackingCarrier?: string;
  trackingNumber?: string;
  paidAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  releasedAt?: string;
  createdAt: string;
}

interface OrderRow {
  id: string;
  listing_id: string | null;
  listing_title: string;
  buyer_id: string | null;
  seller_id: string | null;
  item_amount: number;
  shipping_amount: number;
  protection_amount: number;
  total_amount: number;
  status: OrderStatus;
  tracking_carrier: string | null;
  tracking_number: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  released_at: string | null;
  created_at: string;
}

const toOrder = (row: OrderRow): Order => ({
  id: row.id,
  listingId: row.listing_id,
  listingTitle: row.listing_title,
  buyerId: row.buyer_id,
  sellerId: row.seller_id,
  itemAmount: row.item_amount,
  shippingAmount: row.shipping_amount,
  protectionAmount: row.protection_amount,
  totalAmount: row.total_amount,
  status: row.status,
  trackingCarrier: row.tracking_carrier ?? undefined,
  trackingNumber: row.tracking_number ?? undefined,
  paidAt: row.paid_at ?? undefined,
  shippedAt: row.shipped_at ?? undefined,
  deliveredAt: row.delivered_at ?? undefined,
  releasedAt: row.released_at ?? undefined,
  createdAt: row.created_at,
});

const ORDER_SELECT =
  'id, listing_id, listing_title, buyer_id, seller_id, item_amount, shipping_amount,' +
  ' protection_amount, total_amount, status, tracking_carrier, tracking_number,' +
  ' paid_at, shipped_at, delivered_at, released_at, created_at';

/** Les commandes du membre connecté, achats et ventes confondus. */
export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .order('created_at', { ascending: false });
  if (error) fail(error, 'Chargement des commandes impossible.');
  return (data as OrderRow[]).map(toOrder);
}

export async function fetchOrder(id: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) fail(error, 'Commande introuvable.');
  return data ? toOrder(data as OrderRow) : null;
}

/** Le vendeur déclare l'envoi. Le suivi est facultatif mais fortement conseillé. */
export async function markShipped(
  orderId: string,
  carrier?: string,
  tracking?: string,
): Promise<void> {
  const { error } = await supabase.rpc('mark_order_shipped', {
    order_id: orderId,
    carrier: carrier ?? null,
    tracking: tracking ?? null,
  });
  if (error) fail(error, 'Déclaration d’envoi impossible.');
}

/** L'acheteur confirme la réception : c'est ce qui libère l'argent. */
export async function confirmReceived(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_order_received', { order_id: orderId });
  if (error) fail(error, 'Confirmation impossible.');
}

/** Gèle l'argent en attendant qu'un humain tranche. */
export async function openDispute(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('open_order_dispute', { order_id: orderId });
  if (error) fail(error, 'Ouverture du litige impossible.');
}

// ---------------------------------------------------------------------------
// Compte vendeur
// ---------------------------------------------------------------------------

export interface SellerAccount {
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

/** L'état de vérification du vendeur, ou null s'il n'a jamais commencé. */
export async function fetchSellerAccount(): Promise<SellerAccount | null> {
  const { data, error } = await supabase
    .from('seller_accounts')
    .select('stripe_account_id, charges_enabled, payouts_enabled, details_submitted')
    .maybeSingle();
  if (error) fail(error, 'État du compte de paiement indisponible.');
  if (!data) return null;
  return {
    stripeAccountId: data.stripe_account_id as string,
    chargesEnabled: data.charges_enabled as boolean,
    payoutsEnabled: data.payouts_enabled as boolean,
    detailsSubmitted: data.details_submitted as boolean,
  };
}

/** Un vendeur ne peut encaisser qu'une fois son identité vérifiée par Stripe. */
export const canReceivePayments = (account: SellerAccount | null): boolean =>
  !!account?.chargesEnabled && !!account?.payoutsEnabled;
