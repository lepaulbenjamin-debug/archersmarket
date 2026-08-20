-- Affine le détecteur, éprouvé sur des messages réalistes.
--
-- Deux corrections, toutes deux dictées par ce que cette place de marché
-- autorise réellement :
--
--   — « en espèces » et « par chèque » pesaient autant qu'une proposition de
--     contournement. C'est faux ici : la remise en main propre est un mode de
--     vente officiel, et qui dit main propre dit paiement en liquide. Le
--     détecteur aurait accusé un vendeur sur deux.
--
--   — Un lien externe suffisait à créer un signal de modération. Or un vendeur
--     qui renvoie vers l'essai vidéo de son arc ne fraude pas.
--
-- D'où un seuil : en dessous, le poids reste enregistré sur le message comme
-- élément d'appréciation, mais rien ne remonte en modération. Une file de
-- modération pleine de bruit est une file que personne n'ouvre.

/** En dessous de ce poids, on note sans déranger personne. */
create function risk_threshold() returns integer
language sql immutable as $$ select 40; $$;

create or replace function detect_offsite_payment(corps text)
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

  -- La proposition de contourner, dans ses formulations courantes. C'est
  -- l'intention qui compte, pas le moyen de paiement cité.
  if t ~ '(hors (du )?site|hors (de l.)?appli|en dehors (du site|de l.appli)|sans passer par|sans les frais|eviter les frais|contourner|paiement direct|payer directement|vous payez direct)' then
    total := total + 55; motifs := motifs || 'proposition de contourner la plateforme'::text;
  end if;

  -- Un virement demandé reste un virement demandé, quelle que soit la tournure.
  if t ~ '\m(virement (bancaire|immediat)?|rib)\M' then
    total := total + 45; motifs := motifs || 'virement demandé'::text;
  end if;

  -- Les messageries privées : le moyen de quitter la conversation tracée.
  if t ~ '\m(whatsapp|telegram|snapchat|messenger)\M' then
    total := total + 30; motifs := motifs || 'messagerie privée'::text;
  end if;

  -- Faibles, et volontairement. Ici la remise en main propre est un mode de
  -- vente prévu : payer en liquide en se serrant la main n'a rien de suspect.
  -- Ces mots ne pèsent qu'en compagnie d'autre chose.
  if t ~ '\m(especes|liquide|cash|cheque)\M' then
    total := total + 15; motifs := motifs || 'paiement hors application évoqué'::text;
  end if;

  if t ~ 'https?://' and t !~ 'archersmarket' then
    total := total + 15; motifs := motifs || 'lien externe'::text;
  end if;

  return query select total, array_to_string(motifs, ', ');
end;
$$;

create or replace function flag_message_risk() returns trigger
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

  -- Le poids reste sur le message quoi qu'il arrive : il sert à décider quoi
  -- afficher à l'acheteur, et à comprendre après coup.
  new.risk_weight := poids;
  new.risk_reason := motif;

  -- Mais seul ce qui dépasse le seuil dérange un humain, et seule une
  -- tentative de contournement le fait — pas un simple échange de numéro.
  if detection.poids >= risk_threshold() then
    insert into risk_signals (user_id, kind, weight, detail, message_id)
    values (new.sender_id, 'offsite_payment', least(100, poids), motif, new.id);
  end if;

  return new;
end;
$$;

comment on function detect_offsite_payment is
  'Pèse une tentative de contournement du paiement sécurisé dans un message.';
