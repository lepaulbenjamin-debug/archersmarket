-- Le détecteur ne reconnaissait que les tournures que j'avais en tête.
--
-- Éprouvé sur une quinzaine de formulations écrites au naturel, il laissait
-- passer l'essentiel : « on évite les frais » (le motif exigeait « éviter »),
-- « un petit virement » (le motif exigeait un complément), « on passe pas par
-- le site », « on s'arrange entre nous ». Autrement dit, il attrapait le
-- fraudeur maladroit et manquait tous les autres.
--
-- On raisonne désormais par intention plutôt que par formule : contourner,
-- déplacer le paiement, sortir de la conversation. Les mots qui décrivent un
-- moyen de paiement restent faibles, parce que la remise en main propre est un
-- mode de vente prévu ici.

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

  -- Virement ou RIB, seuls et sous toutes leurs formes. C'est le mot qui
  -- manquait le plus : « un petit virement et c'est réglé » passait.
  if t ~ '\m(virements?|rib|iban)\M' then
    total := total + 45; motifs := motifs || 'virement demandé'::text;
  end if;

  -- Échapper aux frais : l'argument de vente du fraudeur, dans toutes ses
  -- conjugaisons. Se plaindre de la commission n'est pas la contourner.
  if t ~ '\m(evite[rz]?|evitons|contourne[rz]?|echappe[rz]?)\M.{0,24}\m(frais|commission|comm|pourcentage)\M'
     or t ~ '\m(sans|pas de|zero)\M.{0,12}\m(frais|commission)\M' then
    total := total + 55; motifs := motifs || 'contournement des frais'::text;
  end if;

  -- Sortir du site, dans les tournures courantes — y compris la négation
  -- orale, « on passe pas par », qui est celle qu'on écrit vraiment.
  if t ~ '(hors (du )?site|hors (de l.)?appli|en dehors (du site|de l.appli|de la plateforme))'
     or t ~ '\m(sans|pas)\M.{0,14}\mpasser? par\M.{0,20}\m(site|appli|application|plateforme|archers)\M'
     or t ~ '\mpas besoin de\M.{0,20}\m(site|appli|application|plateforme)\M' then
    total := total + 55; motifs := motifs || 'proposition de contourner la plateforme'::text;
  end if;

  -- Régler en direct. On exige le contexte du paiement : « on se voit en
  -- direct » veut dire se rencontrer, ce qui est parfaitement normal ici.
  if t ~ '\m(paiement|payer|paye|payez|regle[rz]?|reglement|traite[rz]?|transaction)\M.{0,24}\m(en direct|directement|de la main a la main)\M' then
    total := total + 45; motifs := motifs || 'paiement en direct proposé'::text;
  end if;

  -- S'arranger entre soi. Modéré : la phrase existe aussi pour convenir d'un
  -- lieu. Elle devient parlante accompagnée d'autre chose.
  if t ~ '\m(s.arrange[rz]?|arrangeons|gere[rz]? ca|entre nous|nous memes?)\M' then
    total := total + 25; motifs := motifs || 'arrangement de gré à gré'::text;
  end if;

  -- Les messageries privées : le moyen de quitter la conversation tracée.
  if t ~ '\m(whatsapp|telegram|snapchat|messenger)\M' then
    total := total + 30; motifs := motifs || 'messagerie privée'::text;
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
