-- Détecter les comptes et les comportements suspects.
--
-- Le paiement sécurisé a changé la donne : maintenant que l'argent transite
-- par la plateforme, la fraude devient rentable. Or toutes les protections
-- construites — séquestre, litige, remboursement — tombent d'un coup dès que
-- l'échange sort de l'application. C'est là qu'il faut regarder en premier.
--
-- Deux partis pris, qui expliquent la forme de ce fichier :
--
--   — On enregistre des *signaux* datés et motivés, pas un score opaque. On
--     peut ainsi expliquer pourquoi un compte remonte, revenir dessus, et se
--     tromper sans conséquence irréversible.
--
--   — Rien n'est bloqué automatiquement. Un faux positif chasserait un membre
--     honnête sans qu'on le sache jamais, et le RGPD encadre les décisions
--     entièrement automatisées. On signale, un humain tranche.

-- ---------------------------------------------------------------------------
-- Les signaux
-- ---------------------------------------------------------------------------

create type risk_kind as enum (
  'offsite_payment',   -- tentative de paiement hors plateforme
  'contact_exchange',  -- coordonnées échangées tôt dans la relation
  'price_anomaly',     -- prix très éloigné de la catégorie
  'burst_listing',     -- publication en rafale sur un compte récent
  'report'             -- signalement par un membre
);

create table risk_signals (
  id uuid primary key default gen_random_uuid(),

  -- Le compte visé. On garde le signal même si le compte part : il documente
  -- une décision de modération.
  user_id uuid references profiles(id) on delete set null,

  kind risk_kind not null,
  -- Poids du signal. Un IBAN dans un message pèse lourd ; un numéro de
  -- téléphone, beaucoup moins — sur ce marché, les gens se donnent rendez-vous
  -- au club.
  weight integer not null check (weight between 1 and 100),

  -- De quoi comprendre sans avoir à fouiller, mais sans recopier le message :
  -- la modération n'a pas besoin de lire les conversations pour trancher.
  detail text,

  message_id uuid references messages(id) on delete cascade,
  listing_id uuid references listings(id) on delete cascade,

  created_at timestamptz not null default now()
);

create index risk_signals_user_idx on risk_signals (user_id, created_at desc);
create index risk_signals_kind_idx on risk_signals (kind, created_at desc);

alter table risk_signals enable row level security;

-- Personne ne lit ses propres signaux : les montrer apprendrait au fraudeur
-- ce qui le trahit. Seule la modération y accède, plus bas.

-- ---------------------------------------------------------------------------
-- Le détecteur
--
-- Ce qui compte n'est pas qu'on parle d'argent — c'est normal sur une place de
-- marché — mais qu'on propose de le faire circuler ailleurs. La remise en main
-- propre, elle, est un mode de vente légitime ici : elle ne doit rien déclencher.
-- ---------------------------------------------------------------------------

create function detect_offsite_payment(corps text)
returns table (poids integer, motif text)
language plpgsql immutable as $$
declare
  t text := lower(unaccent_fallback(corps));
  total integer := 0;
  motifs text[] := '{}';
begin
  -- Un IBAN ne s'écrit pas par hasard dans une conversation.
  if t ~ '\m[a-z]{2}[0-9]{2}[ ]?[a-z0-9]{4}([ ]?[a-z0-9]{4}){2,6}\M' then
    total := total + 60; motifs := motifs || 'coordonnées bancaires'::text;
  end if;

  -- Les services de virement entre particuliers, nommés explicitement.
  if t ~ '\m(paypal|lydia|revolut|wise|sumup|paylib|western union|moneygram)\M' then
    total := total + 50; motifs := motifs || 'service de paiement externe'::text;
  end if;

  -- La proposition elle-même, dans ses formulations courantes.
  if t ~ '(hors (du )?site|hors (de l.)?appli|en dehors (du site|de l.appli)|sans (passer par|les frais)|eviter les frais|de la main a la main sans|paiement direct|virement bancaire|par cheque|en especes)' then
    total := total + 45; motifs := motifs || 'proposition de paiement hors plateforme'::text;
  end if;

  -- Les messageries privées : le moyen de sortir de la conversation tracée.
  if t ~ '\m(whatsapp|telegram|signal|snapchat|messenger)\M' then
    total := total + 25; motifs := motifs || 'messagerie privée'::text;
  end if;

  -- Un lien sortant. Faible seul, révélateur combiné.
  if t ~ 'https?://' and t !~ 'archersmarket' then
    total := total + 20; motifs := motifs || 'lien externe'::text;
  end if;

  return query select total, array_to_string(motifs, ', ');
end;
$$;

comment on function detect_offsite_payment is
  'Pèse une tentative de paiement hors plateforme dans un message.';

/**
 * Coordonnées personnelles.
 *
 * Séparé du reste, et pesé légèrement : sur ce marché, s'échanger un numéro
 * pour convenir d'un rendez-vous au club est parfaitement normal. Ce n'est un
 * signal qu'associé à autre chose.
 */
create function detect_contact_exchange(corps text)
returns integer
language sql immutable as $$
  select case
    when corps ~ '\m0[1-9]([ .-]?[0-9]{2}){4}\M' then 15
    when corps ~ '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}' then 10
    else 0
  end;
$$;

-- ---------------------------------------------------------------------------
-- Le déclencheur
--
-- Il n'empêche jamais un message de partir. Bloquer sur un soupçon rendrait
-- l'application inutilisable au premier faux positif, et le faux positif est
-- certain.
-- ---------------------------------------------------------------------------

alter table messages add column risk_weight integer not null default 0;
alter table messages add column risk_reason text;

create function flag_message_risk() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  detection record;
  contact integer;
  poids integer;
  motif text;
begin
  select * into detection from detect_offsite_payment(new.body);
  contact := detect_contact_exchange(new.body);

  poids := detection.poids + contact;
  motif := nullif(trim(both ', ' from
    coalesce(detection.motif, '') ||
    case when contact > 0 then ', coordonnées personnelles' else '' end), '');

  if poids = 0 then
    return new;
  end if;

  new.risk_weight := poids;
  new.risk_reason := motif;

  -- Les coordonnées seules ne remontent pas en modération : elles font partie
  -- de la vie normale d'une vente entre archers.
  if detection.poids > 0 then
    insert into risk_signals (user_id, kind, weight, detail, message_id)
    values (new.sender_id, 'offsite_payment', least(100, poids), motif, new.id);
  end if;

  return new;
end;
$$;

create trigger messages_risk_flag
  before insert on messages
  for each row execute function flag_message_risk();

comment on column messages.risk_weight is
  'Poids du soupçon de paiement hors plateforme ; 0 quand rien n''a été relevé.';
