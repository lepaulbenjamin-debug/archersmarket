-- Blocage d'un membre.
--
-- Exigé par Apple (règle 1.2) pour toute app où les gens publient et
-- s'écrivent : signaler ne suffit pas, il faut aussi pouvoir couper le contact
-- soi-même, sans attendre une modération.
--
-- Le blocage est unilatéral et discret : la personne bloquée n'en est pas
-- informée. Ses effets, eux, sont symétriques — plus aucun message ne passe
-- dans un sens ni dans l'autre, et chacune disparaît du fil de l'autre.

create table blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on blocks (blocked_id);

alter table blocks enable row level security;

-- Une liste de blocage ne regarde que la personne qui l'a établie.
create policy blocks_own on blocks for all
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- Les règles ci-dessous doivent savoir si l'autre nous a bloqués — une
-- information que blocks_own nous interdit de lire directement. D'où cette
-- fonction, qui ne répond que par oui ou non sur un couple donné et ne laisse
-- donc rien filtrer d'une liste de blocage.
create function is_blocked_between(a uuid, b uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

revoke all on function is_blocked_between(uuid, uuid) from public;
grant execute on function is_blocked_between(uuid, uuid) to authenticated, anon;

-- Le fil masque les annonces des membres bloqués, dans les deux sens. Filtrer
-- ici plutôt que dans l'app garantit que rien ne repasse par un écran oublié.
drop policy listings_read on listings;
create policy listings_read on listings for select
  using (
    (status <> 'draft' or seller_id = auth.uid())
    and not is_blocked_between(auth.uid(), seller_id)
  );

-- Plus aucun message n'entre dans une conversation dès qu'une des deux parties
-- a bloqué l'autre. La lecture de l'historique reste possible : effacer le
-- passé ferait perdre la trace d'un échange qu'on veut parfois signaler.
drop policy messages_insert on messages;
create policy messages_insert on messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversations c
      where c.id = conversation_id
        and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
        and not is_blocked_between(c.buyer_id, c.seller_id)
    )
  );

-- Et aucune conversation ne s'ouvre avec quelqu'un que l'on a bloqué, ou qui
-- nous a bloqués.
drop policy conversations_insert on conversations;
create policy conversations_insert on conversations for insert
  with check (
    buyer_id = auth.uid()
    and exists (select 1 from listings l where l.id = listing_id and l.seller_id = seller_id)
    and not is_blocked_between(auth.uid(), seller_id)
  );
