-- Dernier tour de vis sur le détecteur, et consolidation.
--
-- Trois manques relevés sur un corpus de tournures écrites au naturel :
--
--   — « on passe pas par le site » échappait, parce que le motif attendait la
--     négation avant le verbe. À l'oral, elle vient après.
--
--   — Basculer sur une messagerie privée ne pesait pas assez pour remonter
--     seul, alors que c'est le préalable habituel : on quitte la conversation
--     tracée, puis on propose le virement là où personne ne lit.
--
--   — « on gère ça nous-mêmes » accompagné d'un numéro de téléphone restait
--     sous le seuil, chaque moitié étant trop faible isolément. C'est
--     pourtant le schéma le plus courant : l'arrangement, puis le moyen de
--     l'organiser ailleurs.
--
-- Cette dernière remarque vaut règle : un arrangement de gré à gré doublé
-- d'un échange de coordonnées remonte, même si aucun des deux ne suffisait.

create or replace function detect_offsite_payment(corps text)
returns table (poids integer, motif text)
language plpgsql immutable as $$
declare
  t text := lower(unaccent_fallback(corps));
  total integer := 0;
  motifs text[] := '{}';
begin
  if t ~ '\m[a-z]{2}[0-9]{2}[ ]?[a-z0-9]{4}([ ]?[a-z0-9]{4}){2,6}\M' then
    total := total + 60; motifs := motifs || 'coordonnées bancaires'::text;
  end if;

  if t ~ '\m(paypal|lydia|revolut|wise|sumup|paylib|western union|moneygram)\M' then
    total := total + 50; motifs := motifs || 'service de paiement externe'::text;
  end if;

  if t ~ '\m(virements?|rib|iban)\M' then
    total := total + 45; motifs := motifs || 'virement demandé'::text;
  end if;

  -- Échapper aux frais, dans toutes les conjugaisons. Se plaindre de la
  -- commission n'est pas la contourner : « le site prend une commission,
  -- dommage » ne doit rien déclencher.
  if t ~ '\m(evite[rz]?|evitons|contourne[rz]?|echappe[rz]?)\M.{0,24}\m(frais|commission|comm|pourcentage)\M'
     or t ~ '\m(sans|pas de|zero)\M.{0,12}\m(frais|commission)\M' then
    total := total + 55; motifs := motifs || 'contournement des frais'::text;
  end if;

  -- Sortir du site. La négation se met devant ou derrière le verbe selon
  -- qu'on écrit ou qu'on parle : les deux comptent.
  if t ~ '(hors (du )?site|hors (de l.)?appli|en dehors (du site|de l.appli|de la plateforme))'
     or t ~ '\m(sans|pas)\M.{0,14}\mpasser? par\M.{0,20}\m(site|appli|application|plateforme|archers)\M'
     or t ~ '\mpasse[rz]?\M.{0,6}\mpas par\M.{0,20}\m(site|appli|application|plateforme|archers)\M'
     or t ~ '\mpas besoin de\M.{0,20}\m(site|appli|application|plateforme)\M' then
    total := total + 55; motifs := motifs || 'proposition de contourner la plateforme'::text;
  end if;

  if t ~ '\m(paiement|payer|paye|payez|regle[rz]?|reglement|traite[rz]?|transaction)\M.{0,24}\m(en direct|directement|de la main a la main)\M' then
    total := total + 45; motifs := motifs || 'paiement en direct proposé'::text;
  end if;

  if t ~ '\m(s.arrange[rz]?|arrangeons|gere[rz]? ca|entre nous|nous memes?)\M' then
    total := total + 25; motifs := motifs || 'arrangement de gré à gré'::text;
  end if;

  -- Quitter la conversation tracée est le préalable habituel : cela suffit
  -- désormais à faire remonter, mais faiblement.
  if t ~ '\m(whatsapp|telegram|snapchat|messenger)\M' then
    total := total + 40; motifs := motifs || 'bascule vers une messagerie privée'::text;
  end if;

  -- Faibles, et volontairement : la remise en main propre est un mode de
  -- vente prévu, et qui dit main propre dit paiement en liquide.
  if t ~ '\m(especes|liquide|cash|cheque)\M' then
    total := total + 15; motifs := motifs || 'paiement hors application évoqué'::text;
  end if;

  if t ~ 'https?://' and t !~ 'archersmarket' then
    total := total + 15; motifs := motifs || 'lien externe'::text;
  end if;

  return query select total, array_to_string(motifs, ', ');
end;
$$;

/**
 * Ce qui mérite un œil humain.
 *
 * Le seuil, ou bien la conjonction d'un arrangement de gré à gré et d'un
 * échange de coordonnées : aucune des deux moitiés ne suffit, mais ensemble
 * elles décrivent exactement la manœuvre.
 */
create or replace function record_message_risk() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  detection record;
  contact integer;
begin
  select * into detection from detect_offsite_payment(new.body);
  contact := detect_contact_exchange(new.body);

  if detection.poids < risk_threshold()
     and not (detection.poids >= 25 and contact > 0) then
    return null;
  end if;

  insert into risk_signals (user_id, kind, weight, detail, message_id)
  values (new.sender_id, 'offsite_payment',
          least(100, detection.poids + contact),
          nullif(trim(both ', ' from coalesce(detection.motif, '') ||
            case when contact > 0 then ', coordonnées personnelles' else '' end), ''),
          new.id);

  return null;
exception when others then
  -- Un signal perdu est regrettable ; un message perdu est inacceptable.
  return null;
end;
$$;
