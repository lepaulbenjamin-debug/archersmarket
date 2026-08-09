-- Le vendeur pouvait lire le code de remise.
--
-- Relevé en essayant sous son rôle : retirer le droit de lecture sur une
-- colonne ne sert à rien tant qu'un droit existe sur la table entière — le
-- second couvre toutes les colonnes et l'emporte. Il faut fermer la table,
-- puis rouvrir colonne par colonne.
--
-- L'enjeu n'est pas théorique. Le code est ce qui prouve la rencontre : un
-- vendeur qui le lit peut solder la vente sans jamais avoir sorti l'arc du
-- coffre, et l'acheteur perd le seul moment où il avait la main.

revoke select on orders from authenticated, anon;

grant select (
  id, listing_id, buyer_id, seller_id, listing_title,
  item_amount, shipping_amount, protection_amount, total_amount, currency,
  status, payment_mode,
  stripe_payment_intent_id, stripe_transfer_id, stripe_refund_id, stripe_charge_id,
  tracking_carrier, tracking_number,
  ship_to_civility, ship_to_name, ship_to_address, ship_to_zip, ship_to_city,
  ship_to_country, ship_to_phone,
  shipping_mode, relay_code, relay_label, carrier_operator, carrier_service,
  paid_at, shipped_at, delivered_at, released_at, refunded_at, handover_at,
  created_at, updated_at
) on orders to authenticated;

-- `handover_code` est volontairement absent de cette liste, et doit le rester.
-- Toute colonne ajoutée plus tard devra être accordée explicitement : c'est le
-- prix d'un secret gardé en base plutôt que dans l'application.
comment on column orders.handover_code is
  'Code de remise. Illisible depuis l''app ; l''acheteur passe par handover_code().';
