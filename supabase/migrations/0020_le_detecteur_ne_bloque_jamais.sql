-- Le détecteur empêchait les messages de partir.
--
-- Relevé en essayant le vrai chemin de l'application : le signal était écrit
-- depuis un déclencheur « before insert », alors que le message n'existe pas
-- encore à ce moment-là. La clé étrangère refusait, et son refus annulait
-- l'insertion du message. Autrement dit, dire « virement » suffisait à ne
-- plus pouvoir écrire du tout.
--
-- Deux corrections, et la seconde compte plus que la première :
--
--   — Le poids se pose avant l'insertion, le signal s'écrit après, quand la
--     ligne existe.
--
--   — Et surtout : l'écriture du signal ne peut plus, quoi qu'il arrive,
--     empêcher un message d'arriver. Un outil de surveillance qui casse la
--     messagerie fait plus de mal que la fraude qu'il cherche.

-- Le déclencheur « before » ne fait plus que peser.
create or replace function flag_message_risk() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  detection record;
  contact integer;
  poids integer;
begin
  select * into detection from detect_offsite_payment(new.body);
  contact := detect_contact_exchange(new.body);
  poids := detection.poids + contact;

  if poids > 0 then
    new.risk_weight := poids;
    new.risk_reason := nullif(trim(both ', ' from
      coalesce(detection.motif, '') ||
      case when contact > 0 then ', coordonnées personnelles' else '' end), '');
  end if;

  return new;
exception when others then
  -- Peser un message ne doit jamais empêcher de l'envoyer.
  return new;
end;
$$;

-- L'enregistrement du signal vient après, une fois la ligne écrite.
create function record_message_risk() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  detection record;
begin
  if coalesce(new.risk_weight, 0) < risk_threshold() then
    return null;
  end if;

  -- Seule une tentative de contournement dérange un humain : un simple
  -- échange de numéro n'a rien à faire dans une file de modération.
  select * into detection from detect_offsite_payment(new.body);
  if detection.poids < risk_threshold() then
    return null;
  end if;

  insert into risk_signals (user_id, kind, weight, detail, message_id)
  values (new.sender_id, 'offsite_payment', least(100, new.risk_weight),
          new.risk_reason, new.id);

  return null;
exception when others then
  -- Un signal perdu est regrettable ; un message perdu est inacceptable.
  return null;
end;
$$;

create trigger messages_risk_record
  after insert on messages
  for each row execute function record_message_risk();

comment on function record_message_risk is
  'Enregistre le signal après coup ; ne peut jamais faire échouer un message.';
