-- Garde la référence du paiement encaissé.
--
-- Sans elle, le virement au vendeur échoue systématiquement :
--
--   You have insufficient available funds in your Stripe account.
--
-- Les fonds encaissés arrivent d'abord en solde « en attente » et ne
-- deviennent disponibles qu'après le délai de règlement bancaire — sept jours
-- en France au démarrage. Or l'acheteur confirme sa réception bien avant.
--
-- Stripe prévoit exactement ce cas : un virement rattaché à son encaissement
-- d'origine (source_transaction) part sans attendre, et se règle tout seul
-- quand les fonds arrivent. Encore faut-il savoir de quel encaissement il
-- s'agit — d'où cette colonne.

alter table orders add column stripe_charge_id text;

comment on column orders.stripe_charge_id is
  'Encaissement Stripe d''origine, rattaché au virement pour éviter l''attente du règlement.';
