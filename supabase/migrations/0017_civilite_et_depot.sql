-- Ce que les transporteurs réclament vraiment.
--
-- Découvert en interrogeant Boxtal pour de bon : sur vingt-six offres, les
-- vingt-six exigent la civilité de l'expéditeur et du destinataire, et treize
-- exigent en plus un point de dépôt — celui où le vendeur remet le colis, qui
-- n'est pas celui où l'acheteur le retire. Sans ces champs, aucune étiquette
-- ne s'achète.

-- ---------------------------------------------------------------------------
-- Civilité
--
-- Les transporteurs n'acceptent que « M » ou « Mme ». Ce n'est pas notre
-- choix, et rien d'autre dans l'application ne s'en sert : cette valeur ne
-- sort pas vers l'étiquette.
-- ---------------------------------------------------------------------------

alter table seller_addresses
  add column civility text not null default 'M' check (civility in ('M', 'Mme'));

alter table orders
  add column ship_to_civility text not null default 'M'
    check (ship_to_civility in ('M', 'Mme'));

comment on column seller_addresses.civility is
  'Civilité exigée par les transporteurs sur l''étiquette : « M » ou « Mme ».';

-- ---------------------------------------------------------------------------
-- Point de dépôt
--
-- Le vendeur choisit où déposer son colis. C'est distinct du point de retrait
-- de l'acheteur : une offre peut exiger l'un, l'autre, ou les deux.
-- ---------------------------------------------------------------------------

alter table shipments
  add column dropoff_code text,
  add column dropoff_label text;

comment on column shipments.dropoff_code is
  'Point relais où le vendeur dépose le colis, quand le transporteur l''exige.';
