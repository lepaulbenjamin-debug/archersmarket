-- Notifications push.
--
-- L'envoi part directement de la base via pg_net : un message inséré déclenche
-- l'appel à l'API Expo. Pas de fonction serveur intermédiaire à déployer ni à
-- surveiller, et la notification suit exactement la donnée qui la justifie.

create extension if not exists pg_net;

create table push_tokens (
  -- Jeton Expo (ExponentPushToken[...]), unique par appareil
  token text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on push_tokens (user_id);

alter table push_tokens enable row level security;

-- Chacun ne gère que ses propres appareils.
create policy push_tokens_own on push_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

/**
 * Envoie une notification à tous les appareils d'un membre.
 * SECURITY DEFINER : les jetons du destinataire ne sont pas lisibles par
 * l'expéditeur, seul le déclencheur y accède.
 */
create function send_push(recipient uuid, title text, body text, payload jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  notifications jsonb;
begin
  select jsonb_agg(
           jsonb_build_object(
             'to', token,
             'title', title,
             'body', body,
             'data', payload,
             'sound', 'default',
             'channelId', 'default'
           )
         )
    into notifications
    from push_tokens
   where user_id = recipient;

  -- Personne n'a autorisé les notifications : rien à envoyer.
  if notifications is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
    body := notifications
  );
end;
$$;

-- Nouveau message : prévenir l'autre participant.
create function notify_new_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  conversation conversations%rowtype;
  recipient uuid;
  sender_name text;
  listing_title text;
  preview text;
begin
  select * into conversation from conversations where id = new.conversation_id;
  recipient := case when conversation.buyer_id = new.sender_id
                    then conversation.seller_id else conversation.buyer_id end;

  select name into sender_name from profiles where id = new.sender_id;
  select title into listing_title from listings where id = conversation.listing_id;

  preview := case
    when new.offer is not null
      then 'Offre : ' || trim(to_char(new.offer, 'FM999999990.99')) || ' € — ' || new.body
    else new.body
  end;

  perform send_push(
    recipient,
    coalesce(sender_name, 'Nouveau message'),
    left(preview, 140),
    jsonb_build_object('type', 'message', 'conversationId', new.conversation_id,
                       'listingTitle', listing_title)
  );
  return new;
end;
$$;

create trigger on_message_notify
  after insert on messages
  for each row execute function notify_new_message();

-- Nouvel avis reçu.
create function notify_new_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  author_name text;
begin
  select name into author_name from profiles where id = new.author_id;
  perform send_push(
    new.subject_id,
    'Nouvel avis',
    coalesce(author_name, 'Un membre') || ' vous a attribué ' || new.rating || ' étoile' ||
      case when new.rating > 1 then 's' else '' end || '.',
    jsonb_build_object('type', 'review', 'profileId', new.subject_id)
  );
  return new;
end;
$$;

create trigger on_review_notify
  after insert on reviews
  for each row execute function notify_new_review();
